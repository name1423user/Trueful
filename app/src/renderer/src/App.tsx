import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityBar, type PanelView } from './panel/ActivityBar'
import { AddressBar } from './tab/AddressBar'
import { PageArea } from './tab/PageArea'
import { TabList } from './tab/TabList'
import { useTabs } from './tab/useTabs'
import { useWorkspaces, type IpcErrorCode } from './workspace/useWorkspaces'
import { WorkspaceCreateForm } from './workspace/WorkspaceCreateForm'
import { WorkspaceList } from './workspace/WorkspaceList'

// 上端・左パネル（1段目・2段目、F15）・中央。中央の <main> にページの WebContentsView を重ねる
// （位置と大きさを IPC で Main に報告する。ADR-008）
function App(): React.JSX.Element {
  const { t } = useTranslation()
  const { state, create, switchTo } = useWorkspaces()
  const [adding, setAdding] = useState(false)
  const [switchError, setSwitchError] = useState<IpcErrorCode>()
  const [panelView, setPanelView] = useState<PanelView>('tabs')
  const [collapsed, setCollapsed] = useSidePanelCollapsed()
  const tabs = useTabs(state.status === 'ready' ? state.currentId : null)
  // 作成画面を閉じたら、フォーカスを左パネルの今の Workspace に戻す（キーボードで続けて操作できるように）。
  // 新しい一覧が画面に反映された後（effect）で探す。rAF では描き直しより先に動くことがある
  const refocus = useRef(false)
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    document.querySelector<HTMLElement>('.workspace-row[aria-current="true"]')?.focus()
  })

  if (state.status === 'loading') return <div className="app-shell" />
  if (state.status === 'error') {
    return (
      <div className="app-shell">
        <header className="top-bar" />
        <nav className="activity-bar" aria-label={t('panel.railLabel')} />
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
    refocus.current = true
    setAdding(false)
  }

  const activeTab = tabs.tabs.find((tab) => tab.id === tabs.activeId)
  return (
    <div className={collapsed ? 'app-shell side-collapsed' : 'app-shell'}>
      <header className="top-bar">
        {/* 読み上げは1段目のバッジで行う（同じ内容を二度読まない） */}
        {current && (
          <p className="current-workspace" aria-hidden="true">
            <span className={`mode-dot mode-${current.mode}`} aria-hidden="true" />
            {t('workspace.current', { name: current.name })}
          </p>
        )}
        {!showCreate && (
          <AddressBar
            key={activeTab?.id}
            tab={activeTab}
            page={activeTab && tabs.pages[activeTab.id]}
            onNavigate={(input) => tabs.run((api, ws) => api.navigate(ws, activeTab!.id, input))}
            onControl={(action) =>
              void tabs.run((api, ws) => api.control(ws, activeTab!.id, action))
            }
          />
        )}
        {/* ページ（WebContentsView）は UI の上に重なるので、エラーはページの外（上端）に出す */}
        {switchError && !showCreate && (
          <p role="alert" className="switch-error">
            {t(`error.${switchError}`)}
          </p>
        )}
      </header>
      <ActivityBar
        current={current}
        view={panelView}
        collapsed={collapsed}
        onSelect={(view) => {
          // 表示中のものを押し直したら畳む・開く。別のものなら、開いてそれを出す
          if (view === panelView) setCollapsed(!collapsed)
          else setCollapsed(false)
          setPanelView(view)
        }}
      />
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
      >
        {!showCreate && panelView === 'tabs' && (
          <TabList
            tabs={tabs.tabs}
            activeId={tabs.activeId}
            onActivate={(id) => void tabs.run((api, ws) => api.activate(ws, id))}
            onClose={(id) => void tabs.run((api, ws) => api.close(ws, id))}
            onCreate={() => void tabs.run((api, ws) => api.create(ws))}
          />
        )}
      </WorkspaceList>
      <main className={showCreate ? 'content center' : 'content'}>
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
          <PageArea />
        )}
      </main>
    </div>
  )
}

// 2段目を畳んでいるか（F15）。Cmd/Ctrl+B（メニュー）で畳む・開く。
// ウィンドウの幅が 960px 未満になったら畳み、960px 以上に戻ったら開く（境目を越えたときだけ変える）
const NARROW = '(max-width: 959px)'
function useSidePanelCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => matchMedia(NARROW).matches)
  useEffect(() => {
    const query = matchMedia(NARROW)
    const onChange = (e: MediaQueryListEvent): void => setCollapsed(e.matches)
    query.addEventListener('change', onChange)
    const unsubscribe = window.trueful.ui.onCommand((command) => {
      if (command === 'toggle-side-panel') setCollapsed((c) => !c)
    })
    return () => {
      query.removeEventListener('change', onChange)
      unsubscribe()
    }
  }, [])
  return [collapsed, setCollapsed]
}

export default App
