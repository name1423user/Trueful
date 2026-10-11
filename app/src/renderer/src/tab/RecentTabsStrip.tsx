import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { recentTabs } from './recentTabs'
import { tabTitle } from './tabTitle'
import type { Tab } from './useTabs'

// 最近使ったタブ列（F15）。2段目を畳んでいるときだけ、ページの上に今の Workspace のタブを最後に見た順に並べる
// （枚数は設定 recentTabsCount）。選ぶとそのタブへ、× で閉じる。選択中はグレー系（Blue は使わない）。
// 破棄したタブは、左パネルのタブ列と同じく薄く出す。高さは固定（Workspace を切り替える間にタブ列が空になっても、
// ページの位置を動かさない）
export function RecentTabsStrip(props: {
  tabs: Tab[]
  activeId: number | null
  discardedIds: number[]
  count: number
  onActivate: (id: number) => void
  onClose: (id: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const shown = recentTabs(props.tabs, props.count)
  // 閉じたボタンの代わりに、同じ位置（なければ前）のタブへフォーカスを移す（タブ列を読み直した後に）
  const strip = useRef<HTMLElement>(null)
  const focusAfterClose = useRef<number | null>(null)
  useEffect(() => {
    const index = focusAfterClose.current
    if (index === null) return
    focusAfterClose.current = null
    const items = strip.current?.querySelectorAll<HTMLElement>('.recent-tab-select') ?? []
    items[Math.min(index, items.length - 1)]?.focus()
  }, [props.tabs])
  if (shown.length === 0) return <div className="recent-tabs" />
  return (
    <nav className="recent-tabs" aria-label={t('tab.recentLabel')} ref={strip}>
      {shown.map((tab, index) => {
        const title = tabTitle(t, tab)
        const discarded = props.discardedIds.includes(tab.id)
        return (
          <div key={tab.id} className="recent-tab">
            <button
              type="button"
              className={discarded ? 'recent-tab-select tab-discarded' : 'recent-tab-select'}
              aria-current={tab.id === props.activeId ? 'true' : undefined}
              data-tab-id={tab.id}
              title={title}
              onClick={() => props.onActivate(tab.id)}
            >
              {title}
              {discarded && <span className="visually-hidden">{t('tab.discarded')}</span>}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={t('tab.close', { title })}
              onClick={() => {
                focusAfterClose.current = index
                props.onClose(tab.id)
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}
