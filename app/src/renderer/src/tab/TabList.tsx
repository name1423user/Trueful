import { useTranslation } from 'react-i18next'
import type { Tab } from './useTabs'

// 左パネルのタブ列（今の Workspace のタブ。F15 の2段目）。
// 選択中は aria-current とグレーのハイライト（Blue は Production の Mode 色だけ）。
// 上限のためにページを破棄したタブは、並びを変えずに薄い色と休止マークで出す（選ぶと読み込み直す）
export function TabList(props: {
  tabs: Tab[]
  activeId: number | null
  discardedIds: number[]
  onActivate: (id: number) => void
  onClose: (id: number) => void
  onCreate: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <section className="tab-section" aria-label={t('tab.listLabel')}>
      <ul className="tab-list">
        {props.tabs.map((tab) => {
          // 空のタブは、ページのタイトル（Chromium は about:blank を返す）ではなく「新しいタブ」と出す
          const title = tab.url === 'about:blank' ? t('tab.newTab') : tab.title || tab.url
          const discarded = props.discardedIds.includes(tab.id)
          return (
            <li key={tab.id} className="tab-item">
              <button
                type="button"
                className={discarded ? 'tab-row tab-discarded' : 'tab-row'}
                aria-current={tab.id === props.activeId ? 'true' : undefined}
                title={tab.url}
                onClick={() => props.onActivate(tab.id)}
              >
                {discarded && (
                  <svg className="tab-discarded-mark" aria-hidden="true" viewBox="0 0 12 12">
                    <path d="M4 3v6M8 3v6" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                )}
                {title}
                {discarded && <span className="visually-hidden">{t('tab.discarded')}</span>}
              </button>
              {/* 記号はアイコンとして扱い（読み上げない）、名前は辞書の aria-label で付ける */}
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
