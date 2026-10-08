import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Workspace } from '../workspace/useWorkspaces'
import { TabContextMenu } from './TabContextMenu'
import { tabTitle } from './tabTitle'
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
  // 右クリック（Shift+F10・メニューキー）のメニュー「Workspaceへ移動」の移動先（今の Workspace は除く）と、選んだとき（F17）
  destinations: Workspace[]
  onMove: (tab: Tab, to: Workspace) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<{ tab: Tab; x: number; y: number } | null>(null)
  // メニューを開いたタブ（Esc で閉じたとき、フォーカスを戻す）
  const opener = useRef<HTMLElement | null>(null)
  return (
    <section className="tab-section" aria-label={t('tab.listLabel')}>
      <ul className="tab-list">
        {props.tabs.map((tab) => {
          const title = tabTitle(t, tab)
          const discarded = props.discardedIds.includes(tab.id)
          return (
            <li key={tab.id} className="tab-item">
              <button
                type="button"
                className={discarded ? 'tab-row tab-discarded' : 'tab-row'}
                aria-current={tab.id === props.activeId ? 'true' : undefined}
                data-tab-id={tab.id}
                title={tab.url}
                onClick={() => props.onActivate(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  opener.current = e.currentTarget
                  setMenu({ tab, x: e.clientX, y: e.clientY })
                }}
                onKeyDown={(e) => {
                  // キーボードでメニューを開く（Shift+F10・メニューキー）。タブの左下に出す
                  if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return
                  e.preventDefault()
                  const rect = e.currentTarget.getBoundingClientRect()
                  opener.current = e.currentTarget
                  setMenu({ tab, x: rect.left, y: rect.bottom })
                }}
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
      {menu && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          title={tabTitle(t, menu.tab)}
          destinations={props.destinations}
          onChoose={(to) => {
            setMenu(null)
            props.onMove(menu.tab, to)
          }}
          onClose={(restoreFocus) => {
            setMenu(null)
            if (restoreFocus) opener.current?.focus()
          }}
        />
      )}
    </section>
  )
}
