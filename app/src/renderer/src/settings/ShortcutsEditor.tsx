import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { shortcutProblem } from './shortcut'
import type { Settings } from './useSettings'

type Shortcut = Settings['shortcuts'][number]

// 近道の一覧と追加・削除（F10・F14）。数字だけの localhost の近道は組み込みなので、ここには出さない。
// 変えたら一覧ごと保存する（失敗したら入力は残す）
export function ShortcutsEditor(props: {
  shortcuts: Shortcut[]
  disabled: boolean
  onSave: (shortcuts: Shortcut[]) => Promise<boolean>
}): React.JSX.Element {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [urlTemplate, setUrlTemplate] = useState('')
  const [problem, setProblem] = useState<string>()

  const add = async (): Promise<void> => {
    const found = shortcutProblem(keyword.trim(), urlTemplate.trim(), props.shortcuts)
    if (found) return setProblem(t(`settings.shortcutProblem.${found}`))
    setProblem(undefined)
    const next = [...props.shortcuts, { keyword: keyword.trim(), urlTemplate: urlTemplate.trim() }]
    if (await props.onSave(next)) {
      setKeyword('')
      setUrlTemplate('')
    }
  }

  return (
    <fieldset disabled={props.disabled}>
      <legend>{t('settings.shortcuts')}</legend>
      <p className="settings-hint">{t('settings.shortcutsHint')}</p>
      <ul className="shortcut-list">
        {props.shortcuts.map((s) => (
          <li key={s.keyword}>
            <code>{s.keyword}</code>
            <span className="shortcut-url">{s.urlTemplate}</span>
            <button
              type="button"
              aria-label={t('settings.shortcutRemoveLabel', { keyword: s.keyword })}
              onClick={() => void props.onSave(props.shortcuts.filter((x) => x !== s))}
            >
              {t('settings.shortcutRemove')}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="shortcut-add"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <label>
          {t('settings.shortcutKeyword')}
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </label>
        <label>
          {t('settings.shortcutUrl')}
          <input
            value={urlTemplate}
            placeholder="https://example.com/search?q=%s"
            onChange={(e) => setUrlTemplate(e.target.value)}
          />
        </label>
        <button type="submit">{t('settings.shortcutAdd')}</button>
      </form>
      <p role="alert" className={problem ? undefined : 'visually-hidden'}>
        {problem}
      </p>
    </fieldset>
  )
}
