import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Notice = Extract<
  Awaited<ReturnType<Window['trueful']['startup']['notices']>>,
  { ok: true }
>['value'][number]

// 起動のときの知らせ（F12）。上端に1件ずつ出す。強さは ADR-012 の「ユーザーが取りうる行動」で分ける:
// 自動で直したもの（DB をバックアップから戻した・マニフェストを書き直した）は閉じるだけ、
// 作成が途中で終わっていたら作成画面へ誘導、戻せないもの（DB を新しく作った・Workspace のファイルが消えた）は強く出す。
// ファイルが消えた Workspace は、そのまま使うか削除するかを選んでもらう（選ぶまで消えない）。
// 読み上げの領域は常に置き、中身だけ入れる
export function StartupNotice(props: {
  onCreate: () => void
  onDelete: (workspaceId: number) => void
}): React.JSX.Element {
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
  const dismiss = (notice: Notice): void => setNotices((list) => list.filter((n) => n !== notice))

  const row = (notice: Notice, index: number): React.JSX.Element => {
    return (
      <div key={index} className={`startup-notice${isSevere(notice) ? ' severe' : ''}`}>
        <p>{message(notice)}</p>
        {notice.kind === 'unfinishedCreate' && (
          <button
            type="button"
            className="dormant-notice-close"
            onClick={() => {
              dismiss(notice)
              props.onCreate()
            }}
          >
            {t('startupNotice.create')}
          </button>
        )}
        {notice.kind === 'filesMissing' ? (
          <>
            <button type="button" className="dormant-notice-close" onClick={() => dismiss(notice)}>
              {t('startupNotice.keep')}
            </button>
            <button
              type="button"
              className="dormant-notice-close"
              onClick={() => {
                dismiss(notice)
                props.onDelete(notice.workspaceId)
              }}
            >
              {t('startupNotice.delete')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="dormant-notice-close"
            aria-label={t('startupNotice.closeLabel')}
            onClick={() => dismiss(notice)}
          >
            {t('startupNotice.close')}
          </button>
        )}
      </div>
    )
  }
  const message = (notice: Notice): string => {
    switch (notice.kind) {
      case 'restored':
      case 'recreated':
        return t(`startupNotice.${notice.kind}${notice.brokenFile ? '' : 'NoFile'}`, {
          file: notice.brokenFile
        })
      case 'manifestRepaired':
        return t('startupNotice.manifestRepaired', { names: notice.names.join('」「') })
      case 'unfinishedCreate':
        return t('startupNotice.unfinishedCreate')
      case 'filesMissing':
        return t('startupNotice.filesMissing', { name: notice.name })
    }
  }
  const isSevere = (n: Notice): boolean => n.kind === 'recreated' || n.kind === 'filesMissing'
  return (
    <div className="startup-notices">
      <div role="status" aria-live="polite">
        {notices.map((n, i) => !isSevere(n) && row(n, i))}
      </div>
      <div role="alert">{notices.map((n, i) => isSevere(n) && row(n, i))}</div>
    </div>
  )
}
