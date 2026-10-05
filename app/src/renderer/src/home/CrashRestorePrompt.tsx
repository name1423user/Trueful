import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { IpcErrorCode } from '../workspace/useWorkspaces'

// 異常終了の後の起動で、前回の Workspace とタブを復元するかを聞く（F12）。
// 「復元しない」は Developer Home へ（ページは読み込まない）。復元に失敗したら、ここに留めて知らせる
export function CrashRestorePrompt(props: {
  onRestore: () => Promise<IpcErrorCode | undefined>
  onSkip: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<IpcErrorCode>()
  const busy = useRef(false)
  // 出たら見出しへフォーカスを移す
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])

  const restore = async (): Promise<void> => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(undefined)
    const code = await props.onRestore()
    // 成功したら、呼び出し側がこの画面を閉じる
    if (code) {
      busy.current = false
      setPending(false)
      setError(code)
    }
  }

  return (
    <section className="crash-restore" aria-labelledby="crash-restore-title">
      <h1 id="crash-restore-title" ref={heading} tabIndex={-1}>
        {t('crash.title')}
      </h1>
      <p>{t('crash.lead')}</p>
      {error && <p role="alert">{t('crash.failed', { reason: t(`error.${error}`) })}</p>}
      <div className="actions">
        <button type="button" onClick={() => void restore()} disabled={pending}>
          {pending ? t('crash.restoring') : t('crash.restore')}
        </button>
        <button type="button" onClick={props.onSkip} disabled={pending}>
          {t('crash.skip')}
        </button>
      </div>
    </section>
  )
}
