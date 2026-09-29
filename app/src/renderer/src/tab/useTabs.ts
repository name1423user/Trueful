import { useCallback, useEffect, useRef, useState } from 'react'

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
  // 上限のためにページを破棄したタブ（F02。画面では薄く出す）
  discardedIds: number[]
  pages: Pages
  // 操作が成功したら true（失敗したら、画面は入力などを残す）
  run: (op: (api: Api, workspaceId: number) => Promise<{ ok: boolean }>) => Promise<boolean>
} {
  // タブ列は、どの Workspace のものかと一緒に持つ。今の Workspace のものでなければ空として扱う
  const [state, setState] = useState<TabState & { workspaceId: number | null }>({
    workspaceId: null,
    tabs: [],
    activeId: null,
    discardedIds: []
  })
  const [pages, setPages] = useState<Pages>({})
  // 今の Workspace。遅れて届いた前の Workspace のタブ列で、表示を上書きしないため
  const current = useRef(workspaceId)
  useEffect(() => {
    current.current = workspaceId
  }, [workspaceId])

  const reload = useCallback(async () => {
    if (workspaceId === null) return
    const result = await api.list(workspaceId)
    if (!result.ok || current.current !== workspaceId) return
    setState({ workspaceId, ...result.value })
    // 閉じたタブのページの様子は捨てる
    const ids = new Set(result.value.tabs.map((t) => t.id))
    setPages((p) => Object.fromEntries(Object.entries(p).filter(([id]) => ids.has(Number(id)))))
  }, [workspaceId])

  // Workspace が変わったら読み直す。タブ列の知らせは今の Workspace のものだけ受ける
  useEffect(() => {
    void reload()
    const offList = api.onListChanged((id) => {
      if (id === workspaceId) void reload()
    })
    return offList
  }, [workspaceId, reload])

  // ページの様子が変わったら、タブ列の表示にも反映する。読み込み中の URL は前のページのことがあるので、
  // 読み込みが終わってから反映する
  useEffect(
    () =>
      api.onPageChanged((tabId, page) => {
        setPages((p) => ({ ...p, [tabId]: page }))
        if (page.loading || !page.url) return
        setState((s) => ({
          ...s,
          tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, url: page.url, title: page.title } : t))
        }))
      }),
    []
  )

  // タブの操作（作る・閉じる・選ぶ・開くなど）をして、タブ列を読み直す
  const run = useCallback(
    async (op: (api: Api, workspaceId: number) => Promise<{ ok: boolean }>) => {
      if (workspaceId === null) return false
      const result = await op(api, workspaceId)
      await reload()
      return result.ok
    },
    [workspaceId, reload]
  )

  const mine = state.workspaceId === workspaceId
  return {
    tabs: mine ? state.tabs : [],
    activeId: mine ? state.activeId : null,
    discardedIds: mine ? state.discardedIds : [],
    pages,
    run
  }
}
