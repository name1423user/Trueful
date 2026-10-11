import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShortcutsEditor } from './ShortcutsEditor'
import { SitePermissions } from './SitePermissions'
import { useSettings, type Settings } from './useSettings'

// 設定の画面（F14）。Cmd/Ctrl+, で開き、ページを隠した中央に出す。変えたらすぐ settings.json に書く
// （手で編集したときも、Main の知らせで表示を読み直す）。Esc か「閉じる」で閉じる。
// settings.json を読み書きできないときは、変えられない（Main が保存を断るため）。
// まだ機能がない項目（拡張の配置・最近使ったタブ列・広告ブロック・Sentry など）は、その機能と一緒に足す。
// focusRequest が変わるたび（開いたとき・開いたまま Cmd/Ctrl+, を押したとき）、見出しへフォーカスを移す
export function SettingsScreen(props: {
  focusRequest: number
  workspaces: { id: number; name: string }[]
  onClose: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { snapshot, update } = useSettings()
  const [failed, setFailed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [props.focusRequest])
  // Esc は画面全体で受ける（フォーカスが画面の外に落ちていても閉じられるように）
  const onClose = useRef(props.onClose)
  useEffect(() => {
    onClose.current = props.onClose
  })
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  const save = async (patch: Partial<Settings>): Promise<boolean> => {
    const ok = await update(patch)
    setFailed(!ok)
    return ok
  }
  const change = (patch: Partial<Settings>): void => void save(patch)

  const settings = snapshot?.settings
  const locked = snapshot?.problem?.kind === 'unavailable'
  return (
    <section className="settings-screen" aria-labelledby="settings-title">
      <h1 id="settings-title" ref={heading} tabIndex={-1}>
        {t('settings.title')}
      </h1>
      {snapshot?.problem && <p role="alert">{t(`settings.problem.${snapshot.problem.kind}`)}</p>}
      {failed && <p role="alert">{t('settings.saveFailed')}</p>}
      {settings && (
        <>
          <fieldset disabled={locked}>
            <legend>{t('settings.theme')}</legend>
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <label key={theme}>
                <input
                  type="radio"
                  name="theme"
                  checked={settings.theme === theme}
                  onChange={() => change({ theme })}
                />
                {t(`settings.themes.${theme}`)}
              </label>
            ))}
          </fieldset>
          <fieldset disabled={locked}>
            <legend>{t('settings.startup')}</legend>
            <label>
              <input
                type="checkbox"
                checked={settings.showDeveloperHome}
                onChange={(e) => change({ showDeveloperHome: e.target.checked })}
              />
              {t('settings.showDeveloperHome')}
            </label>
            <NumberField
              label={t('settings.developerHomeAfterMinutes')}
              value={settings.developerHomeAfterMinutes}
              min={1}
              max={10080}
              disabled={!settings.showDeveloperHome}
              onCommit={(v) => change({ developerHomeAfterMinutes: v })}
            />
          </fieldset>
          <fieldset disabled={locked}>
            <legend>{t('settings.history')}</legend>
            <NumberField
              label={t('settings.historyRetentionDays')}
              value={settings.historyRetentionDays}
              min={1}
              max={3650}
              onCommit={(v) => change({ historyRetentionDays: v })}
            />
          </fieldset>
          <fieldset disabled={locked}>
            <legend>{t('settings.keyboard')}</legend>
            <label>
              {t('settings.workspaceSwitchModifier')}
              <select
                value={settings.workspaceSwitchModifier}
                onChange={(e) =>
                  change({
                    workspaceSwitchModifier: e.target.value as Settings['workspaceSwitchModifier']
                  })
                }
              >
                {(['auto', 'ctrl', 'alt'] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`settings.modifiers.${m}`)}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <ShortcutsEditor
            shortcuts={settings.shortcuts}
            disabled={locked}
            onSave={(shortcuts) => save({ shortcuts })}
          />
          <SitePermissions workspaces={props.workspaces} disabled={locked} />
          <fieldset disabled={locked}>
            <legend>{t('settings.tabs')}</legend>
            <NumberField
              label={t('settings.recentTabsCount')}
              value={settings.recentTabsCount}
              min={1}
              max={10}
              onCommit={(v) => change({ recentTabsCount: v })}
            />
            <label>
              <input
                type="checkbox"
                checked={!settings.hideMoveTabNotice}
                onChange={(e) => change({ hideMoveTabNotice: !e.target.checked })}
              />
              {t('settings.showMoveTabNotice')}
            </label>
          </fieldset>
        </>
      )}
      <div className="actions">
        <button type="button" onClick={props.onClose}>
          {t('settings.close')}
        </button>
      </div>
    </section>
  )
}

// 整数の欄。打っている途中の値では書かず、欄を離れたとき・Enter で、範囲内なら書く。
// 範囲外なら、そのときに知らせて書かない（打っている途中では知らせない）
function NumberField(props: {
  label: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onCommit: (value: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const errorId = useId()
  const [draft, setDraft] = useState(String(props.value))
  const [showError, setShowError] = useState(false)
  // 手で編集されて値が変わったら、欄も合わせる（描画の中で前の値と比べる。React の推奨する書き方）
  const [shown, setShown] = useState(props.value)
  if (shown !== props.value) {
    setShown(props.value)
    setDraft(String(props.value))
    setShowError(false)
  }
  const n = Number(draft)
  const valid = /^\d+$/.test(draft) && n >= props.min && n <= props.max
  const commit = (): void => {
    setShowError(!valid)
    if (valid && n !== props.value) props.onCommit(n)
  }
  return (
    <div className="number-field">
      <label>
        {props.label}
        <input
          type="number"
          inputMode="numeric"
          min={props.min}
          max={props.max}
          value={draft}
          disabled={props.disabled}
          aria-invalid={showError}
          aria-describedby={errorId}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
        />
      </label>
      <p id={errorId} role="alert" className={showError ? undefined : 'visually-hidden'}>
        {showError && t('settings.outOfRange', { min: props.min, max: props.max })}
      </p>
    </div>
  )
}
