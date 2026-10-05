import { useTranslation } from 'react-i18next'
import { displayState } from '../workspace/dormant'
import { useNow } from '../workspace/useNow'
import type { Workspace } from '../workspace/useWorkspaces'

// Developer Home（F11）。前回の終了から時間がたって起動したときに、Workspace の一覧をカードで見せる。
// カードを選ぶと、その Workspace を開く（ページは、選ぶまで読み込まない）
export function DeveloperHome(props: {
  workspaces: Workspace[]
  onOpen: (id: number) => void
  onAdd: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const now = useNow()
  return (
    <section className="developer-home" aria-labelledby="developer-home-title">
      <h1 id="developer-home-title">{t('home.title')}</h1>
      <p>{t('home.lead')}</p>
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
