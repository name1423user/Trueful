import { useEffect, useRef, useState } from 'react'

type Api = Window['trueful']['download']
export type Download = Extract<Awaited<ReturnType<Api['list']>>, { ok: true }>['value'][number]

const api = window.trueful.download

// 今の Workspace のダウンロードの一覧（Main の download:* を呼ぶ。enabled は、その画面が出ているとき）。
// 進み具合・状態が変わったら（download:changed）読み直す。続けて読み直したときは、最後の返事だけを使う
export function useDownloads(
  workspaceId: number | null,
  enabled: boolean
): {
  downloads: Download[]
  pause: (id: number) => void
  resume: (id: number) => void
  cancel: (id: number) => void
  showInFolder: (id: number) => void
} {
  // どの Workspace の一覧かを持つ（Workspace が変わったら、前の分は、新しい一覧が届くまで出さない）
  const [loaded, setLoaded] = useState<{ workspaceId: number | null; list: Download[] }>({
    workspaceId: null,
    list: []
  })
  const downloads = enabled && loaded.workspaceId === workspaceId ? loaded.list : []
  const latest = useRef(0)

  useEffect(() => {
    // 画面が出ていないとき・Workspace が決まっていないときは、読み込まない（別の Workspace の分を出さない）
    if (!enabled || workspaceId === null) return
    let alive = true
    const reload = (): void => {
      const mine = ++latest.current
      void api.list(workspaceId ?? undefined).then((result) => {
        if (!alive || mine !== latest.current) return
        // 読み込めなかったときは、古い表示を残さない
        setLoaded({ workspaceId, list: result.ok ? result.value : [] })
      })
    }
    reload()
    const unsubscribe = api.onChanged(reload)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [workspaceId, enabled])

  return {
    downloads,
    pause: (id) => void api.pause(id),
    resume: (id) => void api.resume(id),
    cancel: (id) => void api.cancel(id),
    showInFolder: (id) => void api.showInFolder(id)
  }
}
