import { useCallback, useEffect, useState } from 'react'

type Api = Window['trueful']['tab']
type TabState = Extract<Awaited<ReturnType<Api['list']>>, { ok: true }>['value']
export type Tab = TabState['tabs'][number]
export type PageState = Parameters<Parameters<Api['onPageChanged']>[0]>[1]

// ページの様子（タブごと）。戻る・進むの可否と読み込み中は、ページの知らせからだけ分かる
type Pages = Record<number, PageState>

const api = window.trueful.tab

// 今の Workspace のタブ列と、ページの様子（F02）。Main の知らせ（tab:listChanged・tab:pageChanged）で更新する
export function useTabs(workspaceId: number | null): {
  tabs: Tab[]
  activeId: number | null
  pages: Pages
  run: (op: (api: Api, workspaceId: number) => Promise<unknown>) => Promise<void>
} {
  const [state, setState] = useState<TabState>({ tabs: [], activeId: null })
  const [pages, setPages] = useState<Pages>({})

  const reload = useCallback(async () => {
    if (workspaceId === null) return
    const result = await api.list(workspaceId)
    if (result.ok) setState(result.value)
  }, [workspaceId])

  // Workspace が変わったら読み直す。タブ列の知らせは今の Workspace のものだけ受ける
  useEffect(() => {
    let active = true
    if (workspaceId !== null) {
      void api.list(workspaceId).then((result) => {
        if (active && result.ok) setState(result.value)
      })
    }
    const offList = api.onListChanged((id) => {
      if (id === workspaceId) void reload()
    })
    return () => {
      active = false
      offList()
    }
  }, [workspaceId, reload])

  // ページの URL・タイトルが変わったら、タブ列の表示にも反映する
  useEffect(
    () =>
      api.onPageChanged((tabId, page) => {
        setPages((p) => ({ ...p, [tabId]: page }))
        setState((s) => ({
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tabId && page.url ? { ...t, url: page.url, title: page.title } : t
          )
        }))
      }),
    []
  )

  // タブの操作（作る・閉じる・選ぶなど）をして、タブ列を読み直す
  const run = useCallback(
    async (op: (api: Api, workspaceId: number) => Promise<unknown>) => {
      if (workspaceId === null) return
      await op(api, workspaceId)
      await reload()
    },
    [workspaceId, reload]
  )

  return { ...state, pages, run }
}
