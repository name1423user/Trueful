import { useTranslation } from 'react-i18next'
import type { Workspace } from '../workspace/useWorkspaces'
import { initial } from './initial'

// 2段目に出すもの。ブックマーク（T3-2）とダウンロード（T3-3）は、それぞれのタスクで足す
export type PanelView = 'tabs'

// 左端の1段目（幅 48px、F15）。一番上に今の Workspace の頭文字と Mode 色、その下に2段目の切り替え。
// 2段目を畳んでも、ここで今の Workspace が分かる
export function ActivityBar(props: {
  current: Workspace | undefined
  view: PanelView
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
        aria-pressed={props.view === 'tabs'}
        title={t('panel.tabs')}
        onClick={() => props.onSelect('tabs')}
      >
        {/* 記号の文字は OS のフォントで出ないことがあるので、線で描く */}
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
          <path d="M2 3h12M2 8h12M2 13h12" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="visually-hidden">{t('panel.tabs')}</span>
      </button>
    </nav>
  )
}
