import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PageState, Tab } from './useTabs'

type Action = 'back' | 'forward' | 'reload' | 'stop'

// 上端のアドレスバー（F02）。戻る・進む・再読み込み（読み込み中は停止）と、URL・検索語の入力。
// 入力中はページの URL で上書きしない。Cmd/Ctrl+L・K でフォーカスする（メニューからの ui:command）
export function AddressBar(props: {
  tab: Tab | undefined
  page: PageState | undefined
  onNavigate: (input: string) => void
  onControl: (action: Action) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const url = props.page?.url || props.tab?.url || ''
  const shown = editing ?? (url === 'about:blank' ? '' : url)

  useEffect(
    () =>
      window.trueful.ui.onCommand(() => {
        input.current?.focus()
        input.current?.select()
      }),
    []
  )

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (editing === null) return
    props.onNavigate(editing)
    setEditing(null)
    input.current?.blur()
  }

  const loading = props.page?.loading ?? false
  return (
    <form className="address-bar" onSubmit={submit} role="search">
      <button
        type="button"
        aria-label={t('tab.back')}
        disabled={!props.page?.canGoBack}
        onClick={() => props.onControl('back')}
      >
        ←
      </button>
      <button
        type="button"
        aria-label={t('tab.forward')}
        disabled={!props.page?.canGoForward}
        onClick={() => props.onControl('forward')}
      >
        →
      </button>
      <button
        type="button"
        aria-label={loading ? t('tab.stop') : t('tab.reload')}
        disabled={!props.tab}
        onClick={() => props.onControl(loading ? 'stop' : 'reload')}
      >
        {loading ? '×' : '↻'}
      </button>
      <input
        ref={input}
        name="address"
        aria-label={t('tab.address')}
        placeholder={t('tab.addressPlaceholder')}
        value={shown}
        disabled={!props.tab}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setEditing(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setEditing(null)
            e.currentTarget.blur()
          }
        }}
        onBlur={() => setEditing((v) => (v === shown ? null : v))}
      />
    </form>
  )
}
