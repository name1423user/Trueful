import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaces } from './workspace/useWorkspaces'
import { WorkspaceCreateForm } from './workspace/WorkspaceCreateForm'
import { WorkspaceList } from './workspace/WorkspaceList'

// 三ペイン（上端・左パネル・中央）。中央の <main> には、のちにページの WebContentsView を重ねる
// （位置と大きさを IPC で Main に報告する。T2-2）
function App(): React.JSX.Element {
  const { t } = useTranslation()
  const { state, create, switchTo } = useWorkspaces()
  const [adding, setAdding] = useState(false)

  if (state.status === 'loading') return <div className="app-shell" />
  if (state.status === 'error') {
    return (
      <div className="app-shell">
        <main className="content center" role="alert">
          {t(`error.${state.code}`)}
        </main>
      </div>
    )
  }

  const current = state.workspaces.find((w) => w.id === state.currentId)
  // Workspace が0個のときは、最初の Workspace を作る画面だけを出す（SPEC のエッジケース）
  const showCreate = state.workspaces.length === 0 || adding

  return (
    <div className="app-shell">
      <header className="top-bar" />
      <WorkspaceList
        workspaces={state.workspaces}
        currentId={state.currentId}
        onSwitch={(id) => void switchTo(id)}
        onAdd={() => setAdding(true)}
      />
      <main className="content center">
        {showCreate ? (
          <WorkspaceCreateForm
            onCreate={async (name, mode) => {
              const code = await create(name, mode)
              if (!code) setAdding(false)
              return code
            }}
            onCancel={state.workspaces.length > 0 ? () => setAdding(false) : undefined}
          />
        ) : (
          current && (
            <p className="current-workspace">{t('workspace.current', { name: current.name })}</p>
          )
        )}
      </main>
    </div>
  )
}

export default App
