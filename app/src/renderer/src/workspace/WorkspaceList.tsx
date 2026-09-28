import { useTranslation } from 'react-i18next'
import type { Workspace } from './useWorkspaces'

// 左パネルの Workspace の一覧（F01・F15 の一部）。行を選ぶと切り替える。
// 今の Workspace は aria-current で示し、ハイライトはグレー系（Blue は Production の Mode 色だけ）。
// 0個のときは中央が作成画面なので、「追加」は出さない
export function WorkspaceList(props: {
  workspaces: Workspace[]
  currentId: number | null
  onSwitch: (id: number) => void
  onAdd: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <nav className="left-panel" aria-label={t('workspace.listLabel')}>
      <ul className="workspace-list">
        {props.workspaces.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              className="workspace-row"
              aria-current={w.id === props.currentId ? 'true' : undefined}
              onClick={() => props.onSwitch(w.id)}
            >
              <span className={`mode-dot mode-${w.mode}`} aria-hidden="true" />
              {w.name}
            </button>
          </li>
        ))}
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
