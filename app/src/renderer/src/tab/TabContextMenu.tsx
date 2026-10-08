import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Workspace } from '../workspace/useWorkspaces'

const MENU_WIDTH = 200
const MARGIN = 4
const ITEM_HEIGHT = 32

// タブの右クリックのメニュー「Workspaceへ移動」（F17）。移動先の Workspace を並べる（今の Workspace は除く）。
// ページ（WebContentsView）は左パネルの外の中央に重なるので、メニューは左パネルの中に収める。
// ↑↓・Home・End で選び、Enter で決め、Esc で閉じる（閉じたら、呼び出し側が元のタブにフォーカスを戻す）。
// メニューの外を押したり、フォーカスが外へ出たりしたら閉じる
export function TabContextMenu(props: {
  // メニューを出す位置（右クリックした点、またはキーボードで開いたタブの左下）
  x: number
  y: number
  title: string
  destinations: Workspace[]
  onChoose: (workspace: Workspace) => void
  // restoreFocus: Esc で閉じたときは、元のタブにフォーカスを戻す。外を押した・フォーカスが外へ出たときは戻さない
  onClose: (restoreFocus: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const menu = useRef<HTMLUListElement>(null)

  // 左パネルの中に収める
  const panel = document.querySelector('.left-panel')?.getBoundingClientRect()
  const minX = (panel?.left ?? 0) + MARGIN
  const maxX = (panel?.right ?? window.innerWidth) - MENU_WIDTH - MARGIN
  const left = Math.max(minX, Math.min(props.x, maxX))
  // 窓の下からはみ出さない（はみ出す分は、メニューの中でスクロールする）
  const height = Math.max(props.destinations.length, 1) * ITEM_HEIGHT + 2 * MARGIN
  const top = Math.max(MARGIN, Math.min(props.y, window.innerHeight - height - MARGIN))

  useEffect(() => {
    const items = menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
    items?.[0]?.focus()
    const outside = (e: MouseEvent): void => {
      if (!menu.current?.contains(e.target as Node)) props.onClose(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
    // 開いている間は props.onClose が変わっても、登録し直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const move = (to: 'next' | 'previous' | 'first' | 'last'): void => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next =
      to === 'first'
        ? 0
        : to === 'last'
          ? items.length - 1
          : to === 'next'
            ? (at + 1) % items.length
            : (at - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <ul
      ref={menu}
      role="menu"
      aria-label={t('tab.moveMenuLabel', { title: props.title })}
      className="tab-context-menu"
      style={{ left, top, width: MENU_WIDTH }}
      onKeyDown={(e) => {
        const keys: Record<string, 'next' | 'previous' | 'first' | 'last'> = {
          ArrowDown: 'next',
          ArrowUp: 'previous',
          Home: 'first',
          End: 'last'
        }
        if (e.key in keys) {
          e.preventDefault()
          move(keys[e.key]!)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          props.onClose(true)
        } else if (e.key === 'Tab') {
          e.preventDefault()
          props.onClose(true)
        }
      }}
      onBlur={(e) => {
        // フォーカスがメニューの外へ出たら閉じる
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) props.onClose(false)
      }}
    >
      {props.destinations.length === 0 ? (
        <li role="none">
          <span role="menuitem" aria-disabled="true" tabIndex={-1} className="tab-menu-item">
            {t('tab.moveNoDestination')}
          </span>
        </li>
      ) : (
        props.destinations.map((w) => (
          <li key={w.id} role="none">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="tab-menu-item"
              onClick={() => props.onChoose(w)}
            >
              <span className={`mode-dot mode-${w.mode}`} aria-hidden="true" />
              {t('tab.moveTo', { name: w.name })}
            </button>
          </li>
        ))
      )}
    </ul>
  )
}
