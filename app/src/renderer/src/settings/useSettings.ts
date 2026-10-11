import { useCallback, useEffect, useState } from 'react'

export type SettingsSnapshot = Extract<
  Awaited<ReturnType<Window['trueful']['settings']['get']>>,
  { ok: true }
>['value']
export type Settings = SettingsSnapshot['settings']

// 今の設定（F14）。settings.json を手で編集したときも、Main の知らせで読み直す
export function useSettings(): {
  snapshot: SettingsSnapshot | undefined
  update: (patch: Partial<Settings>) => Promise<boolean>
} {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot>()
  useEffect(() => {
    let alive = true
    const unsubscribe = window.trueful.settings.onChanged((s) => alive && setSnapshot(s))
    window.trueful.settings.get().then(
      (result) => alive && result.ok && setSnapshot((s) => s ?? result.value),
      () => undefined
    )
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])
  const update = useCallback(async (patch: Partial<Settings>): Promise<boolean> => {
    const result = await window.trueful.settings.update(patch).catch(() => undefined)
    if (!result?.ok) return false
    setSnapshot((s) => ({ ...s, settings: result.value }))
    return true
  }, [])
  return { snapshot, update }
}
