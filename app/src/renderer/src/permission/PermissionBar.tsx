import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { permissionMessage } from './message'
import type { PermissionAnswer, PermissionPrompt } from './usePermissionPrompts'

// 出てからボタンを押せるようになるまで（ミリ秒）。連打や、ページの上での連続クリックで、
// 入れ替わった次の確認に答えてしまわないように（Chrome の入力保護と同じ考え方）
const PERMISSION_INPUT_DELAY_MS = 600

// 権限の確認（F16、T3-7b）。アドレスバーの下（ページの領域の上端）に細い帯として出す。
// ページ（WebContentsView）は UI の上に重なるので、帯の分だけページの領域を下げて、隠れないようにする。
// 「今は決めない」は拒否するが、記憶しない（次に求められたら、また確認する）。
// 呼び出し側は key に確認の id を渡す（入れ替わったら作り直し、押せるまでの待ちをやり直す）。
// 出たことの読み上げは、呼び出し側の常設のライブ領域で行う
export function PermissionBar(props: {
  prompt: PermissionPrompt
  onAnswer: (id: number, answer: PermissionAnswer) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { id, origin, permission } = props.prompt
  const [ready, setReady] = useState(false)
  const bar = useRef<HTMLElement>(null)
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), PERMISSION_INPUT_DELAY_MS)
    // 前の確認にキーボードで答えて入れ替わったときは、フォーカスを新しい帯に移す
    if (focusNextBar) bar.current?.focus()
    focusNextBar = false
    return () => clearTimeout(timer)
  }, [])

  const answer = (value: PermissionAnswer): void => {
    // 答えた後、次の確認があればその帯へ、なければアドレスバーへフォーカスを移す（body に落とさない）
    if (bar.current?.contains(document.activeElement)) {
      focusNextBar = true
      setTimeout(() => {
        if (!focusNextBar) return
        focusNextBar = false
        document.querySelector<HTMLElement>('.address-bar input')?.focus()
      }, 100)
    }
    props.onAnswer(id, value)
  }

  return (
    <section
      ref={bar}
      className="permission-bar"
      aria-label={t('permission.barLabel')}
      tabIndex={-1}
    >
      <p>{permissionMessage(t, origin, permission)}</p>
      <div className="permission-actions">
        <button type="button" disabled={!ready} onClick={() => answer('allow')}>
          {t('permission.allow')}
        </button>
        <button type="button" disabled={!ready} onClick={() => answer('deny')}>
          {t('permission.deny')}
        </button>
        <button type="button" disabled={!ready} onClick={() => answer('dismissed')}>
          {t('permission.later')}
        </button>
      </div>
    </section>
  )
}

// 次の帯にフォーカスを移すか（答えてから、次の帯ができるまでの間だけ true）
let focusNextBar = false
