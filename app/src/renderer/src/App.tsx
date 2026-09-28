import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaces, type IpcErrorCode } from './workspace/useWorkspaces'
import { WorkspaceCreateForm } from './workspace/WorkspaceCreateForm'
import { WorkspaceList } from './workspace/WorkspaceList'

// 作成画面を閉じたら、フォーカスを左パネルの今の Workspace に戻す（キーボードで続けて操作できるように）。
// 閉じた後の描き直しを待ってから探す
function focusCurrentWorkspace(): void {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>('.left-panel [aria-current="true"]')?.focus()
  )
}

// 三ペイン（上端・左パネル・中央）。中央の <main> には、のちにページの WebContentsView を重ねる
// （位置と大きさを IPC で Main に報告する。T2-2）
function App(): React.JSX.Element {
  const { t } = useTranslation()
  const { state, create, switchTo } = useWorkspaces()
  const [adding, setAdding] = useState(false)
  const [switchError, setSwitchError] = useState<IpcErrorCode>()

  if (state.status === 'loading') return <div className="app-shell" />
  if (state.status === 'error') {
    return (
      <div className="app-shell">
        <header className="top-bar" />
        <nav className="left-panel" aria-label={t('workspace.listLabel')} />
        <main className="content center">
          <p role="alert">{t(`error.${state.code}`)}</p>
        </main>
      </div>
    )
  }

  const current = state.workspaces.find((w) => w.id === state.currentId)
  // Workspace が0個のときは、中央に最初の Workspace を作る画面を出す（SPEC のエッジケース）
  const showCreate = state.workspaces.length === 0 || adding

  const closeCreate = (): void => {
    setAdding(false)
    focusCurrentWorkspace()
  }

  return (
    <div className="app-shell">
      <header className="top-bar" />
      <WorkspaceList
        workspaces={state.workspaces}
        currentId={state.currentId}
        onSwitch={async (id) => {
          setAdding(false)
          setSwitchError(await switchTo(id))
        }}
        onAdd={() => {
          setSwitchError(undefined)
          setAdding(true)
        }}
      />
      <main className="content center">
        {switchError && !showCreate && <p role="alert">{t(`error.${switchError}`)}</p>}
        {showCreate ? (
          <WorkspaceCreateForm
            onCreate={async (name, mode, requestId) => {
              const code = await create(name, mode, requestId)
              if (!code) closeCreate()
              return code
            }}
            onCancel={state.workspaces.length > 0 ? closeCreate : undefined}
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
