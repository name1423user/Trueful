import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PageState, Tab } from './useTabs'

type Action = 'back' | 'forward' | 'reload' | 'stop'

// 上端のアドレスバー（F02）。戻る・進む・再読み込み（読み込み中は停止）と、URL・検索語の入力。
// タブごとに作り直す（App で key にタブの id を渡す。打ちかけの文字を別のタブに送らないため）。
// Cmd/Ctrl+L（アドレスバー）と Cmd/Ctrl+K（統合検索）はどちらもここにフォーカスする。
// SPEC では、アドレスバーが統合検索欄を兼ねる（候補の一覧は F10 で足す）
export function AddressBar(props: {
  tab: Tab | undefined
  page: PageState | undefined
  onNavigate: (input: string) => Promise<boolean>
  onControl: (action: Action) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<string | null>(null)
  // 読み込み中のページの知らせの URL は前のページのことがあるので、そのときは開こうとしている URL（タブの記録）を出す
  const url = (props.page?.loading ? props.tab?.url : props.page?.url) || props.tab?.url || ''
  const current = url === 'about:blank' ? '' : url
  const shown = editing ?? current

  useEffect(
    () =>
      window.trueful.ui.onCommand((command) => {
        // 統合検索欄（F10）ができるまでは、Cmd/Ctrl+K もアドレスバーへ
        if (command !== 'focus-address-bar' && command !== 'focus-search') return
        input.current?.focus()
        input.current?.select()
      }),
    []
  )

  // 開けなかったとき（入力が長すぎるなど）は、打った文字を残す
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (await props.onNavigate(editing ?? current)) {
      setEditing(null)
      input.current?.blur()
    }
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
        <span aria-hidden="true">←</span>
      </button>
      <button
        type="button"
        aria-label={t('tab.forward')}
        disabled={!props.page?.canGoForward}
        onClick={() => props.onControl('forward')}
      >
        <span aria-hidden="true">→</span>
      </button>
      <button
        type="button"
        aria-label={loading ? t('tab.stop') : t('tab.reload')}
        disabled={!props.tab}
        onClick={() => props.onControl(loading ? 'stop' : 'reload')}
      >
        <span aria-hidden="true">{loading ? '×' : '↻'}</span>
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
          // 日本語の変換中の Esc は、変換の取り消しにだけ使う
          if (e.nativeEvent.isComposing) return
          // Esc は打った文字を捨てて、ページの URL に戻す（フォーカスは残す。Chrome と同じ）
          if (e.key === 'Escape') {
            setEditing(null)
            requestAnimationFrame(() => input.current?.select())
          }
        }}
        // 打ちかけの文字は、フォーカスが外れても残す（Chrome と同じ）。ページの URL と同じなら編集をやめる
        onBlur={() => setEditing((v) => (v === current ? null : v))}
      />
    </form>
  )
}
