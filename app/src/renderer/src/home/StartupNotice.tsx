import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Notice = Extract<
  Awaited<ReturnType<Window['trueful']['startup']['notices']>>,
  { ok: true }
>['value'][number]

// 起動のときの知らせ（F12。壊れた DB をバックアップから戻した・新しく作った）。上端に出し、閉じられる。
// 読み上げの領域は常に置き、中身だけ入れる
export function StartupNotice(): React.JSX.Element {
  const { t } = useTranslation()
  const [notices, setNotices] = useState<Notice[]>([])
  useEffect(() => {
    let alive = true
    window.trueful.startup.notices().then(
      (result) => alive && result.ok && setNotices(result.value),
      () => undefined
    )
    return () => {
      alive = false
    }
  }, [])
  // 新しく作った（以前の Workspace が一覧から消えた）ときは、強く知らせる（ADR-012 の「復旧不可」）
  const severe = notices.some((n) => n.kind === 'recreated')
  const message = notices
    .map((n) => t(`startupNotice.${n.kind}${n.brokenFile ? '' : 'NoFile'}`, { file: n.brokenFile }))
    .join(' ')
  return (
    <div className={notices.length > 0 ? `startup-notice${severe ? ' severe' : ''}` : undefined}>
      <p role="status" aria-live="polite">
        {!severe && message}
      </p>
      {severe && <p role="alert">{message}</p>}
      {notices.length > 0 && (
        <button
          type="button"
          className="dormant-notice-close"
          aria-label={t('startupNotice.closeLabel')}
          onClick={() => setNotices([])}
        >
          {t('startupNotice.close')}
        </button>
      )}
    </div>
  )
}
