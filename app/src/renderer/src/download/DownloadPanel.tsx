import { useTranslation } from 'react-i18next'
import { availableActions, baseName, formatBytes, progressPercent } from './format'
import type { Download } from './useDownloads'

// 左パネルの2段目のダウンロード（F07・F15）。今の Workspace の分を新しい順に出す。
// 進捗は <progress>、状態は文字（色だけに頼らない）。操作は、その状態でできるものだけ出す
export function DownloadPanel(props: {
  downloads: Download[]
  onPause: (id: number) => void
  onResume: (id: number) => void
  onCancel: (id: number) => void
  onShowInFolder: (id: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <nav className="left-panel" aria-label={t('download.listLabel')}>
      {props.downloads.length === 0 ? (
        <p className="download-empty">{t('download.empty')}</p>
      ) : (
        <ul className="download-list">
          {props.downloads.map((d) => {
            const name = baseName(d.path)
            const percent = progressPercent(d.receivedBytes, d.totalBytes)
            const actions = availableActions(d.state)
            const running = d.state === 'in_progress' || d.state === 'paused'
            return (
              <li key={d.id} className="download-item">
                <span className="download-name" title={d.path}>
                  {name}
                </span>
                <span className="download-state" role="status">
                  {t(`download.state.${d.state}`)}
                  {running &&
                    ` ${formatBytes(d.receivedBytes)}${d.totalBytes ? ` / ${formatBytes(d.totalBytes)}` : ''}`}
                </span>
                {running && (
                  <progress
                    className="download-progress"
                    aria-label={t('download.progress', { name })}
                    max={100}
                    value={percent}
                  />
                )}
                <span className="download-actions">
                  {actions.pause && (
                    <button
                      type="button"
                      aria-label={t('download.pauseNamed', { name })}
                      onClick={() => props.onPause(d.id)}
                    >
                      {t('download.pause')}
                    </button>
                  )}
                  {actions.resume && (
                    <button
                      type="button"
                      aria-label={t('download.resumeNamed', { name })}
                      onClick={() => props.onResume(d.id)}
                    >
                      {t('download.resume')}
                    </button>
                  )}
                  {actions.cancel && (
                    <button
                      type="button"
                      aria-label={t('download.cancelNamed', { name })}
                      onClick={() => props.onCancel(d.id)}
                    >
                      {t('download.cancel')}
                    </button>
                  )}
                  {actions.show && (
                    <button
                      type="button"
                      aria-label={t('download.showInFolderNamed', { name })}
                      onClick={() => props.onShowInFolder(d.id)}
                    >
                      {t('download.showInFolder')}
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}
