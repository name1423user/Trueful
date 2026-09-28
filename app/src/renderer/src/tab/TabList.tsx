import { useTranslation } from 'react-i18next'
import type { Tab } from './useTabs'

// 左パネルのタブ列（今の Workspace のタブ。F15 の2段目は T2-4 で作り込む）。
// 選択中は aria-current とグレーのハイライト（Blue は Production の Mode 色だけ）
export function TabList(props: {
  tabs: Tab[]
  activeId: number | null
  onActivate: (id: number) => void
  onClose: (id: number) => void
  onCreate: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <section className="tab-section" aria-label={t('tab.listLabel')}>
      <ul className="tab-list">
        {props.tabs.map((tab) => {
          const title = tab.title || (tab.url === 'about:blank' ? t('tab.newTab') : tab.url)
          return (
            <li key={tab.id} className="tab-item">
              <button
                type="button"
                className="tab-row"
                aria-current={tab.id === props.activeId ? 'true' : undefined}
                title={tab.url}
                onClick={() => props.onActivate(tab.id)}
              >
                {title}
              </button>
              <button
                type="button"
                className="tab-close"
                aria-label={t('tab.close', { title })}
                onClick={() => props.onClose(tab.id)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="tab-new" onClick={props.onCreate}>
        <span aria-hidden="true">+ </span>
        {t('tab.newTab')}
      </button>
    </section>
  )
}
