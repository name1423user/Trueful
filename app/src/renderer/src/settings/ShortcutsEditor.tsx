import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { shortcutProblem } from './shortcut'
import type { Settings } from './useSettings'

type Shortcut = Settings['shortcuts'][number]
type Problem = NonNullable<ReturnType<typeof shortcutProblem>>

// 近道の一覧と追加・削除（F10・F14）。数字だけの localhost の近道は組み込みなので、ここには出さない。
// 変えたら一覧ごと保存する（失敗したら入力は残す）。保存している間は、次の変更を受けない
// （古い一覧から作って保存すると、前の変更を消してしまうため）
export function ShortcutsEditor(props: {
  shortcuts: Shortcut[]
  disabled: boolean
  onSave: (shortcuts: Shortcut[]) => Promise<boolean>
}): React.JSX.Element {
  const { t } = useTranslation()
  const errorId = useId()
  const [keyword, setKeyword] = useState('')
  const [urlTemplate, setUrlTemplate] = useState('')
  const [problem, setProblem] = useState<Problem>()
  const [saving, setSaving] = useState(false)
  const keywordInput = useRef<HTMLInputElement>(null)
  const urlInput = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const save = async (next: Shortcut[]): Promise<boolean> => {
    setSaving(true)
    try {
      return await props.onSave(next)
    } finally {
      setSaving(false)
    }
  }
  const add = async (): Promise<void> => {
    // 統合検索欄はキーワードを小文字で照らし合わせるので、小文字にしてから調べる
    const entry = { keyword: keyword.trim().toLowerCase(), urlTemplate: urlTemplate.trim() }
    const found = shortcutProblem(entry.keyword, entry.urlTemplate, props.shortcuts)
    // 同じ誤りが続いても読み上げるよう、一度消してから出す
    setProblem(undefined)
    if (found) {
      requestAnimationFrame(() => setProblem(found))
      ;(found === 'url' ? urlInput : keywordInput).current?.focus()
      return
    }
    if (await save([...props.shortcuts, entry])) {
      setKeyword('')
      setUrlTemplate('')
    }
  }
  // 消したボタンの代わりに、次の行（なければ前の行、なければキーワードの欄）へフォーカスを移す。
  // 保存が終わって一覧を描き直した後（ボタンが押せるようになってから）に行う
  const focusAfterRemove = useRef<number | null>(null)
  useEffect(() => {
    const index = focusAfterRemove.current
    if (index === null || saving) return
    focusAfterRemove.current = null
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ;(buttons[Math.min(index, buttons.length - 1)] ?? keywordInput.current)?.focus()
  })
  const remove = async (s: Shortcut, index: number): Promise<void> => {
    focusAfterRemove.current = index
    if (!(await save(props.shortcuts.filter((x) => x !== s)))) focusAfterRemove.current = null
  }
  const urlProblem = problem === 'url'

  return (
    <fieldset disabled={props.disabled}>
      <legend>{t('settings.shortcuts')}</legend>
      <p className="settings-hint">{t('settings.shortcutsHint')}</p>
      <ul className="shortcut-list" ref={list}>
        {props.shortcuts.map((s, index) => (
          <li key={s.keyword}>
            <code>{s.keyword}</code>
            <span className="shortcut-url">{s.urlTemplate}</span>
            <button
              type="button"
              disabled={saving}
              aria-label={t('settings.shortcutRemoveLabel', { keyword: s.keyword })}
              onClick={() => void remove(s, index)}
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
          if (!saving) void add()
        }}
      >
        <label>
          {t('settings.shortcutKeyword')}
          <input
            ref={keywordInput}
            value={keyword}
            aria-invalid={problem !== undefined && !urlProblem}
            aria-describedby={errorId}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </label>
        <label>
          {t('settings.shortcutUrl')}
          <input
            ref={urlInput}
            value={urlTemplate}
            placeholder="https://example.com/search?q=%s"
            aria-invalid={urlProblem}
            aria-describedby={errorId}
            onChange={(e) => setUrlTemplate(e.target.value)}
          />
        </label>
        <button type="submit" disabled={saving}>
          {t('settings.shortcutAdd')}
        </button>
      </form>
      <p id={errorId} role="alert" className={problem ? undefined : 'visually-hidden'}>
        {problem && t(`settings.shortcutProblem.${problem}`)}
      </p>
    </fieldset>
  )
}
