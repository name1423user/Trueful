import { useTranslation } from 'react-i18next'
import type { Workspace } from './useWorkspaces'

// 左パネルの2段目の Workspace の一覧（F01・F15）。行を選ぶと切り替える。
// 今の Workspace だけ、行の下にタブ列（children）を入れ子で出す。ほかの Workspace は名前の行だけ。
// 今の Workspace は aria-current で示し、ハイライトはグレー系（Blue は Production の Mode 色だけ）。
// 0個のときは中央が作成画面なので、「追加」は出さない
export function WorkspaceList(props: {
  workspaces: Workspace[]
  currentId: number | null
  onSwitch: (id: number) => void
  onAdd: () => void
  // 今の Workspace の行の下に並べるもの（タブ列）
  children?: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <nav className="left-panel" aria-label={t('workspace.listLabel')}>
      <ul className="workspace-list">
        {props.workspaces.map((w) => {
          const current = w.id === props.currentId
          return (
            <li key={w.id} className="workspace-item">
              <button
                type="button"
                className="workspace-row"
                aria-current={current ? 'true' : undefined}
                aria-expanded={current}
                onClick={() => props.onSwitch(w.id)}
              >
                <span className={`mode-dot mode-${w.mode}`} aria-hidden="true" />
                {w.name}
              </button>
              {current && props.children}
            </li>
          )
        })}
      </ul>
      {props.workspaces.length > 0 && (
        <button type="button" className="workspace-add" onClick={props.onAdd}>
          <span aria-hidden="true">+ </span>
          {t('workspace.add')}
        </button>
      )}
    </nav>
  )
}
