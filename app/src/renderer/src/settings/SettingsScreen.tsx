import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings, type Settings } from './useSettings'

// 設定の画面（F14）。Cmd/Ctrl+, で開き、ページを隠した中央に出す。変えたらすぐ settings.json に書く
// （手で編集したときも、Main の知らせで表示を読み直す）。Esc か「閉じる」で閉じる。
// まだ機能がない項目（拡張の配置・最近使ったタブ列・広告ブロック・Sentry など）は、その機能と一緒に足す
export function SettingsScreen(props: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const { snapshot, update } = useSettings()
  const [failed, setFailed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const change = (patch: Partial<Settings>): void => void update(patch).then((ok) => setFailed(!ok))

  const settings = snapshot?.settings
  return (
    <section
      className="settings-screen"
      aria-labelledby="settings-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') props.onClose()
      }}
    >
      <h1 id="settings-title" ref={heading} tabIndex={-1}>
        {t('settings.title')}
      </h1>
      {snapshot?.problem && <p role="alert">{t(`settings.problem.${snapshot.problem.kind}`)}</p>}
      {failed && <p role="alert">{t('settings.saveFailed')}</p>}
      {settings && (
        <>
          <fieldset>
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
          <fieldset>
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
              key={settings.developerHomeAfterMinutes}
              label={t('settings.developerHomeAfterMinutes')}
              value={settings.developerHomeAfterMinutes}
              min={1}
              max={10080}
              disabled={!settings.showDeveloperHome}
              onCommit={(v) => change({ developerHomeAfterMinutes: v })}
            />
          </fieldset>
          <fieldset>
            <legend>{t('settings.history')}</legend>
            <NumberField
              key={settings.historyRetentionDays}
              label={t('settings.historyRetentionDays')}
              value={settings.historyRetentionDays}
              min={1}
              max={3650}
              onCommit={(v) => change({ historyRetentionDays: v })}
            />
          </fieldset>
          <fieldset>
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
          <fieldset>
            <legend>{t('settings.tabs')}</legend>
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

// 整数の欄。打っている途中の値では書かず、欄を離れたとき・Enter で、範囲内なら書く（範囲外なら知らせて戻さない）
function NumberField(props: {
  label: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onCommit: (value: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  // 手で編集されて値が変わったら、呼び出し側が key を変えて作り直す（欄も合わせる）
  const [draft, setDraft] = useState(String(props.value))
  const n = Number(draft)
  const valid = /^\d+$/.test(draft) && n >= props.min && n <= props.max
  const commit = (): void => {
    if (valid && n !== props.value) props.onCommit(n)
  }
  return (
    <label>
      {props.label}
      <input
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        value={draft}
        disabled={props.disabled}
        aria-invalid={!valid}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {!valid && (
        <span role="alert">{t('settings.outOfRange', { min: props.min, max: props.max })}</span>
      )}
    </label>
  )
}
