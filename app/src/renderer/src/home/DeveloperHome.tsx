import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { displayState } from '../workspace/dormant'
import { useNow } from '../workspace/useNow'
import type { IpcErrorCode, Workspace } from '../workspace/useWorkspaces'

// Developer Home（F11）。前回の終了から時間がたって起動したときに、Workspace の一覧をカードで見せる。
// カードを選ぶと、その Workspace を開く（ページは、選ぶまで読み込まない）
export function DeveloperHome(props: {
  workspaces: Workspace[]
  onOpen: (id: number) => void
  onAdd: () => void
  // 開けなかったとき（Workspace が見つからないなど）。Home に留めて知らせる
  error?: IpcErrorCode
}): React.JSX.Element {
  const { t } = useTranslation()
  const now = useNow()
  // 出たら見出しへフォーカスを移す（キーボードで、左パネルを通らずにカードへ進めるように）
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <section className="developer-home" aria-labelledby="developer-home-title">
      <h1 id="developer-home-title" ref={heading} tabIndex={-1}>
        {t('home.title')}
      </h1>
      <p>{t('home.lead')}</p>
      {props.error && <p role="alert">{t(`error.${props.error}`)}</p>}
      <ul className="home-cards">
        {props.workspaces.map((w) => {
          const state = displayState(w, now)
          return (
            <li key={w.id}>
              <button type="button" className="home-card" onClick={() => props.onOpen(w.id)}>
                <span className="home-card-name">
                  <span className={`mode-dot mode-${w.mode}`} aria-hidden="true" />
                  {w.name}
                </span>
                <span className="home-card-meta">
                  {t(`workspace.mode.${w.mode}`)}
                  {state !== 'active' && ` ・ ${t(`workspace.state.${state}`)}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="home-add" onClick={props.onAdd}>
        <span aria-hidden="true">+ </span>
        {t('workspace.add')}
      </button>
    </section>
  )
}
