import { useTranslation } from 'react-i18next'
import { recentTabs } from './recentTabs'
import { tabTitle } from './tabTitle'
import type { Tab } from './useTabs'

// 最近使ったタブ列（F15）。2段目を畳んでいるときだけ、ページの上に今の Workspace のタブを最後に見た順に並べる
// （枚数は設定 recentTabsCount）。選ぶとそのタブへ、× で閉じる。選択中はグレー系（Blue は使わない）
export function RecentTabsStrip(props: {
  tabs: Tab[]
  activeId: number | null
  count: number
  onActivate: (id: number) => void
  onClose: (id: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <nav className="recent-tabs" aria-label={t('tab.recentLabel')}>
      {recentTabs(props.tabs, props.count).map((tab) => {
        const title = tabTitle(t, tab)
        return (
          <div key={tab.id} className="recent-tab">
            <button
              type="button"
              className="recent-tab-select"
              aria-current={tab.id === props.activeId}
              title={title}
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
              ×
            </button>
          </div>
        )
      })}
    </nav>
  )
}
