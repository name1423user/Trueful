import { useCallback, useEffect, useRef, useState } from 'react'

type Api = Window['trueful']['bookmark']
type ListResult = Awaited<ReturnType<Api['list']>>
export type Bookmark = Extract<ListResult, { ok: true }>['value'][number]
export type ImportOutcome = Extract<Awaited<ReturnType<Api['importChrome']>>, { ok: true }>['value']

const api = window.trueful.bookmark

// ブックマークの一覧と、追加・編集・削除・取り込み（Main の bookmark:* を呼ぶ）。
// 変えたら一覧を読み直す。続けて読み直したときは、最後の返事だけを使う
export function useBookmarks(): {
  bookmarks: Bookmark[]
  failed: boolean
  add: (title: string, url: string) => Promise<boolean>
  update: (id: number, patch: { title: string; url?: string }) => Promise<boolean>
  remove: (id: number) => Promise<void>
  importFrom: (source: 'chrome' | 'html') => Promise<ImportOutcome | undefined>
} {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [failed, setFailed] = useState(false)
  const latest = useRef(0)

  const reload = useCallback(async () => {
    const mine = ++latest.current
    const result = await api.list()
    if (mine !== latest.current) return
    setFailed(!result.ok)
    if (result.ok) setBookmarks(result.value)
  }, [])
  // 最初の読み込み。画面が消えたら、返事を捨てる
  useEffect(() => {
    let alive = true
    void api.list().then((result) => {
      if (!alive) return
      setFailed(!result.ok)
      if (result.ok) setBookmarks(result.value)
    })
    return () => {
      alive = false
    }
  }, [])

  const add = useCallback(
    async (title: string, url: string) => {
      const result = await api.add({ kind: 'url', title, url })
      await reload()
      return result.ok
    },
    [reload]
  )
  const update = useCallback(
    async (id: number, patch: { title: string; url?: string }) => {
      const result = await api.update({ id, ...patch })
      await reload()
      return result.ok
    },
    [reload]
  )
  const remove = useCallback(
    async (id: number) => {
      await api.delete(id)
      await reload()
    },
    [reload]
  )
  const importFrom = useCallback(
    async (source: 'chrome' | 'html') => {
      const result = await (source === 'chrome' ? api.importChrome() : api.importHtml())
      await reload()
      return result.ok ? result.value : undefined
    },
    [reload]
  )
  return { bookmarks, failed, add, update, remove, importFrom }
}
