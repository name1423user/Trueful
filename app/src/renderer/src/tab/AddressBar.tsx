import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { OmniboxList } from '../omnibox/OmniboxList'
import { useSuggestions, type Candidate } from '../omnibox/useSuggestions'
import type { PageState, Tab } from './useTabs'

type Action = 'back' | 'forward' | 'reload' | 'stop'

// コピーした結果を出しておく時間（ミリ秒）
const COPIED_MS = 3000

// 上端のアドレスバー（F02）。戻る・進む・再読み込み（読み込み中は停止）と、URL・検索語の入力。
// タブごとに作り直す（App で key にタブの id を渡す。打ちかけの文字を別のタブに送らないため）。
// Cmd/Ctrl+L（アドレスバー）と Cmd/Ctrl+K（統合検索）はどちらもここにフォーカスする。
// アドレスバーが統合検索欄を兼ねる（F10）。打つと候補の一覧を出す（slot の中。ページを押し下げるため、
// 一覧は上端ではなく中央の列の先頭に置く）。矢印キーで選び、Enter で実行する。何も選んでいない Enter は、
// これまでどおり打った文字をそのまま開く（答えや候補を勝手に選ばない）。Esc は、一覧を閉じてから、文字を捨てる
export function AddressBar(props: {
  tab: Tab | undefined
  page: PageState | undefined
  workspaceId: number | null
  workspaceName: (id: number) => string | undefined
  // 一覧を出す場所（中央の列の先頭）
  slot: HTMLElement | null
  onNavigate: (input: string) => Promise<boolean>
  // 別のタブ・Workspace へ移る候補を選んだ（今の Workspace の履歴・ブックマークは onNavigate で開く）
  onPick: (candidate: Candidate) => Promise<boolean>
  onControl: (action: Action) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<string | null>(null)
  // 一覧を閉じているか（Esc・選んだあと）と、選んでいる候補（-1: なし）
  const [closed, setClosed] = useState(false)
  const [active, setActive] = useState(-1)
  // コピーの結果（目に見える形でも出し、少しして消す。同じ答えを続けてコピーしても読み上げ直すため、末尾を交互に変える）
  const [copied, setCopied] = useState('')
  const copyCount = useRef(0)
  useEffect(() => {
    if (copied === '') return
    const timer = setTimeout(() => setCopied(''), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  // 実行中は、続けて Enter やクリックをされても、もう一度実行しない（別の Workspace へ移る間に、タブが2つできるなど）
  const choosing = useRef(false)
  const listId = useId()
  const candidates = useSuggestions(editing, props.workspaceId)
  const showList = editing !== null && !closed && candidates.length > 0
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

  // 候補を選んで実行する。答えはクリップボードにコピーし、ほかは開く・切り替える。失敗したら一覧を残す
  const choose = async (c: Candidate): Promise<void> => {
    if (choosing.current) return
    choosing.current = true
    try {
      await run(c)
    } finally {
      choosing.current = false
    }
  }
  const run = async (c: Candidate): Promise<void> => {
    if (c.kind === 'answer') {
      const result = await window.trueful.omnibox.copy(c.title).catch(() => undefined)
      const message = result?.ok ? t('omnibox.copied', { value: c.title }) : t('omnibox.copyFailed')
      setCopied(message + (copyCount.current++ % 2 ? '\u00a0' : ''))
      setClosed(true)
      setActive(-1)
      return
    }
    const here = c.otherWorkspace !== true
    const done =
      c.kind === 'url' ||
      c.kind === 'search' ||
      (here && c.kind !== 'tab' && c.kind !== 'workspace')
        ? await props.onNavigate(c.url ?? '')
        : await props.onPick(c)
    if (done) {
      setEditing(null)
      setClosed(true)
      input.current?.blur()
    }
  }

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
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setEditing(e.target.value)
          setClosed(false)
          setActive(-1)
          setCopied('')
        }}
        onFocus={(e) => {
          e.target.select()
          setClosed(false)
        }}
        onKeyDown={(e) => {
          // 日本語の変換中のキーは、変換のために使う
          if (e.nativeEvent.isComposing) return
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && candidates.length > 0) {
            e.preventDefault()
            setClosed(false)
            const n = candidates.length
            setActive((i) =>
              e.key === 'ArrowDown' ? (i + 1) % n : i < 0 ? n - 1 : (i - 1 + n) % n
            )
            return
          }
          // 候補を選んでいるときの Enter は、その候補を実行する（フォームの送信にしない）
          const chosen = showList ? candidates[active] : undefined
          if (e.key === 'Enter' && chosen) {
            e.preventDefault()
            void choose(chosen)
            return
          }
          // Esc: 一覧が出ていれば、一覧だけ閉じる（打った文字は残す）
          if (e.key === 'Escape' && showList) {
            e.preventDefault()
            setClosed(true)
            setActive(-1)
            return
          }
          // Esc は打った文字を捨てて、ページの URL に戻す（フォーカスは残す。Chrome と同じ）
          if (e.key === 'Escape') {
            setEditing(null)
            requestAnimationFrame(() => input.current?.select())
          }
        }}
        // 打ちかけの文字は、フォーカスが外れても残す（Chrome と同じ）。ページの URL と同じなら編集をやめる
        onBlur={() => {
          setEditing((v) => (v === current ? null : v))
          setClosed(true)
        }}
      />
      {/* 選んだ結果の読み上げ（領域は常に置き、中身だけ入れる） */}
      <p role="status" aria-live="polite" className={copied ? 'omnibox-copied' : undefined}>
        {copied}
      </p>
      {showList &&
        props.slot &&
        createPortal(
          <OmniboxList
            id={listId}
            candidates={candidates}
            active={active}
            workspaceName={props.workspaceName}
            onChoose={(i) => void choose(candidates[i]!)}
          />,
          props.slot
        )}
    </form>
  )
}
