import { useEffect, useRef, useState } from 'react'
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
  // 読み上げる文。最初に受け取ったときに1回だけ決める（閉じるたびに残りを読み直さない）
  const [announced, setAnnounced] = useState<Notice[]>([])
  useEffect(() => {
    let alive = true
    window.trueful.startup.notices().then(
      (result) => {
        if (!alive || !result.ok) return
        setNotices(result.value)
        setAnnounced(result.value)
      },
      () => undefined
    )
    return () => {
      alive = false
    }
  }, [])
  const container = useRef<HTMLDivElement>(null)
  // 閉じたら、フォーカスを次の知らせのボタンへ（なければ1段目。body に落とさない）
  const dismiss = (notice: Notice): void => {
    setNotices((list) => list.filter((n) => n !== notice))
    requestAnimationFrame(() =>
      (
        container.current?.querySelector<HTMLElement>('button') ??
        document.querySelector<HTMLElement>('.activity-button')
      )?.focus()
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
      case 'settings':
        return t(`startupNotice.settings.${notice.problem.kind}`, {
          // 保存場所の中のファイル名だけを出す（DB の知らせと同じ）
          file:
            notice.problem.kind === 'invalid-json'
              ? notice.problem.brokenFile.split(/[\\/]/).pop()
              : undefined
        })
    }
  }
  const button = (label: string, onClick: () => void, ariaLabel?: string): React.JSX.Element => (
    <button type="button" className="dormant-notice-close" aria-label={ariaLabel} onClick={onClick}>
      {label}
    </button>
  )
  const isSevere = (n: Notice): boolean => n.kind === 'recreated' || n.kind === 'filesMissing'
  const announce = (severe: boolean): string =>
    announced
      .filter((n) => isSevere(n) === severe)
      .map(message)
      .join(' ')
  return (
    <div className="startup-notices" ref={container}>
      {/* 読み上げの領域は常に置き、文だけを入れる（ボタンは領域の外） */}
      <p role="status" aria-live="polite" className="visually-hidden">
        {announce(false)}
      </p>
      <p role="alert" className="visually-hidden">
        {announce(true)}
      </p>
      {notices.map((notice) => (
        <div
          key={`${notice.kind}-${'workspaceId' in notice ? notice.workspaceId : ''}`}
          className={`startup-notice${isSevere(notice) ? ' severe' : ''}`}
        >
          <p>{message(notice)}</p>
          {notice.kind === 'unfinishedCreate' &&
            button(t('startupNotice.create'), () => {
              dismiss(notice)
              props.onCreate()
            })}
          {notice.kind === 'filesMissing' ? (
            <>
              {button(
                t('startupNotice.keep'),
                () => dismiss(notice),
                t('startupNotice.keepLabel', { name: notice.name })
              )}
              {button(
                t('startupNotice.delete'),
                () => {
                  dismiss(notice)
                  props.onDelete(notice.workspaceId)
                },
                t('startupNotice.deleteLabel', { name: notice.name })
              )}
            </>
          ) : (
            button(
              t('startupNotice.close'),
              () => dismiss(notice),
              t(`startupNotice.closeLabel.${notice.kind}`)
            )
          )}
        </div>
      ))}
    </div>
  )
}
