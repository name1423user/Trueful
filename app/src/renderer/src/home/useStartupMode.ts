import { useEffect, useState } from 'react'

// 起動したときに Main が決めた表示。pending は、まだ返事がない（ページを出さずに待つ）。
// home は Developer Home（F11）、crash は異常終了の後の「復元しますか」（F12）を出している。
// Workspace を開く・作ると done にする
export type StartupView = 'pending' | 'crash' | 'home' | 'done'

export function useStartupView(): {
  view: StartupView
  finish: () => void
  // 異常終了の確認で「復元しない」を選んだら、Developer Home を出す
  showHome: () => void
} {
  const [view, setView] = useState<StartupView>('pending')
  useEffect(() => {
    let alive = true
    // 決められなかったとき（エラー・返事が届かない）は、復元と同じに扱う
    const decide = (next: StartupView): void => {
      if (alive) setView((v) => (v !== 'pending' ? v : next))
    }
    window.trueful.startup.mode().then(
      (result) =>
        decide(
          !result.ok
            ? 'done'
            : result.value === 'developer-home'
              ? 'home'
              : result.value === 'crash'
                ? 'crash'
                : 'done'
        ),
      () => decide('done')
    )
    return () => {
      alive = false
    }
  }, [])
  return { view, finish: () => setView('done'), showHome: () => setView('home') }
}
