import { useEffect, useRef, useState } from 'react'

type Api = Window['trueful']['download']
export type Download = Extract<Awaited<ReturnType<Api['list']>>, { ok: true }>['value'][number]

const api = window.trueful.download

// 今の Workspace のダウンロードの一覧（Main の download:* を呼ぶ）。
// 進み具合・状態が変わったら（download:changed）読み直す。続けて読み直したときは、最後の返事だけを使う
export function useDownloads(workspaceId: number | null): {
  downloads: Download[]
  pause: (id: number) => void
  resume: (id: number) => void
  cancel: (id: number) => void
  showInFolder: (id: number) => void
} {
  const [downloads, setDownloads] = useState<Download[]>([])
  const latest = useRef(0)

  useEffect(() => {
    let alive = true
    const reload = (): void => {
      const mine = ++latest.current
      void api.list(workspaceId ?? undefined).then((result) => {
        if (alive && mine === latest.current && result.ok) setDownloads(result.value)
      })
    }
    reload()
    const unsubscribe = api.onChanged(reload)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [workspaceId])

  return {
    downloads,
    pause: (id) => void api.pause(id),
    resume: (id) => void api.resume(id),
    cancel: (id) => void api.cancel(id),
    showInFolder: (id) => void api.showInFolder(id)
  }
}
