import { useTranslation } from 'react-i18next'
import type { Candidate } from './useSuggestions'

// 統合検索欄の候補の一覧（F10）。アドレスバーの下（ページの領域の上端）に、リストボックスとして出す。
// ページ（WebContentsView）は UI の上に重なるので、一覧の分だけページの領域を下げて隠れないようにする
// （権限の確認の帯と同じ。R4 の代替案）。選択は aria-selected と、グレー系の背景（Blue は使わない）
export function OmniboxList(props: {
  id: string
  candidates: Candidate[]
  active: number
  workspaceName: (id: number) => string | undefined
  onChoose: (index: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <ul id={props.id} role="listbox" aria-label={t('omnibox.listLabel')} className="omnibox-list">
      {props.candidates.map((c, i) => {
        const kind =
          c.kind === 'answer' ? t(`omnibox.answer.${c.answerKind}`) : t(`omnibox.kind.${c.kind}`)
        const note = c.kind === 'answer' ? c.detail : c.kind === 'workspace' ? undefined : c.url
        return (
          <li
            key={i}
            id={`${props.id}-${i}`}
            role="option"
            aria-selected={i === props.active}
            className="omnibox-option"
            // クリックで入力欄のフォーカスが外れて、一覧が閉じないように
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => props.onChoose(i)}
          >
            <span className="omnibox-kind">{kind}</span>
            {c.color && (
              <span className="omnibox-swatch" style={{ background: c.color }} aria-hidden="true" />
            )}
            <span className="omnibox-title">{c.title}</span>
            {note && <span className="omnibox-note">{note}</span>}
            {c.otherWorkspace && c.workspaceId !== undefined && (
              <span className="omnibox-workspace">
                <span className={`mode-dot mode-${c.mode}`} aria-hidden="true" />
                {props.workspaceName(c.workspaceId)}
              </span>
            )}
            {c.kind === 'answer' && <span className="omnibox-hint">{t('omnibox.copyHint')}</span>}
          </li>
        )
      })}
    </ul>
  )
}
