import { useEffect, useState } from 'react'

// 起動したときに Main が決めた表示（F11）。pending は、まだ返事がない（ページを出さずに待つ）。
// home は Developer Home を出している。Workspace を選ぶ・作ると done にする
export type StartupView = 'pending' | 'home' | 'done'

export function useStartupView(): [StartupView, () => void] {
  const [view, setView] = useState<StartupView>('pending')
  useEffect(() => {
    let alive = true
    void window.trueful.startup.mode().then((result) => {
      // 決められなかったときは、復元と同じに扱う
      if (alive)
        setView((v) =>
          v !== 'pending' ? v : result.ok && result.value === 'developer-home' ? 'home' : 'done'
        )
    })
    return () => {
      alive = false
    }
  }, [])
  return [view, () => setView('done')]
}
