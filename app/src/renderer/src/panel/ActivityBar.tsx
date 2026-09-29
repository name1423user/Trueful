import { useTranslation } from 'react-i18next'
import type { Workspace } from '../workspace/useWorkspaces'
import { initial } from './initial'

// 2段目に出すもの。ダウンロード（T3-3）は、そのタスクで足す
export type PanelView = 'tabs' | 'bookmarks'

// 左端の1段目（幅 48px、F15）。一番上に今の Workspace の頭文字と Mode 色、その下に2段目の切り替え。
// 2段目を畳んでも、ここで今の Workspace が分かる。表示中の切り替えを押し直すと、2段目を畳む・開く
export function ActivityBar(props: {
  current: Workspace | undefined
  view: PanelView
  collapsed: boolean
  onSelect: (view: PanelView) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { current } = props
  return (
    <nav className="activity-bar" aria-label={t('panel.railLabel')}>
      {current && (
        <span
          role="img"
          className={`workspace-badge mode-${current.mode}`}
          aria-label={t('workspace.current', { name: current.name })}
          title={current.name}
        >
          {initial(current.name)}
        </span>
      )}
      <button
        type="button"
        className="activity-button"
        aria-pressed={props.view === 'tabs' && !props.collapsed}
        title={t('panel.tabs')}
        onClick={() => props.onSelect('tabs')}
      >
        {/* 記号の文字は OS のフォントで出ないことがあるので、線で描く */}
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
          <path d="M2 3h12M2 8h12M2 13h12" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="visually-hidden">{t('panel.tabs')}</span>
      </button>
      <button
        type="button"
        className="activity-button"
        aria-pressed={props.view === 'bookmarks' && !props.collapsed}
        title={t('panel.bookmarks')}
        onClick={() => props.onSelect('bookmarks')}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
          <path d="M4 2h8v12l-4-3-4 3z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="visually-hidden">{t('panel.bookmarks')}</span>
      </button>
    </nav>
  )
}
