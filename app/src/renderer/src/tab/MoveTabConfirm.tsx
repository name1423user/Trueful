import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Workspace } from '../workspace/useWorkspaces'

// タブを別の Workspace へ移す前の確認（F17）。移動先は Cookie が別なので、ログイン状態が変わることを知らせる。
// 「今後表示しない」を選べる（設定 hideMoveTabNotice）。Esc とボタンでやめられる。左パネルの中に出す
export function MoveTabConfirm(props: {
  title: string
  destination: Workspace
  onConfirm: (dontAskAgain: boolean) => void
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [dontAsk, setDontAsk] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const bodyId = useId()
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('button')?.focus()
  }, [])
  return (
    <div
      ref={root}
      role="alertdialog"
      aria-labelledby={headingId}
      aria-describedby={bodyId}
      className="move-tab-confirm"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          props.onCancel()
        }
      }}
    >
      <h3 id={headingId}>{t('tab.moveConfirmTitle', { title: props.title })}</h3>
      <p id={bodyId}>{t('tab.moveConfirmBody', { name: props.destination.name })}</p>
      <label>
        <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
        {t('tab.moveDontAsk')}
      </label>
      <div className="move-tab-actions">
        <button type="button" onClick={() => props.onConfirm(dontAsk)}>
          {t('tab.moveConfirm')}
        </button>
        <button type="button" onClick={props.onCancel}>
          {t('tab.moveCancel')}
        </button>
      </div>
    </div>
  )
}
