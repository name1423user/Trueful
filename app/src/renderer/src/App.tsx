import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookmarkPanel } from './bookmark/BookmarkPanel'
import { importMessageKey } from './bookmark/tree'
import { useBookmarks } from './bookmark/useBookmarks'
import { DownloadPanel } from './download/DownloadPanel'
import { useDownloads } from './download/useDownloads'
import { CrashRestorePrompt } from './home/CrashRestorePrompt'
import { StartupNotice } from './home/StartupNotice'
import { DeveloperHome } from './home/DeveloperHome'
import { useStartupView } from './home/useStartupMode'
import { ActivityBar, type PanelView } from './panel/ActivityBar'
import { permissionMessage } from './permission/message'
import { PermissionBar } from './permission/PermissionBar'
import { usePermissionPrompt } from './permission/usePermissionPrompts'
import { AddressBar } from './tab/AddressBar'
import type { Candidate } from './omnibox/useSuggestions'
import { ErrorScreen } from './tab/ErrorScreen'
import { PageArea } from './tab/PageArea'
import { MoveTabConfirm } from './tab/MoveTabConfirm'
import { TabList } from './tab/TabList'
import { tabTitle } from './tab/tabTitle'
import { useMoveTab } from './tab/useMoveTab'
import { useTabs } from './tab/useTabs'
import { useWorkspaces, type IpcErrorCode } from './workspace/useWorkspaces'
import { WorkspaceCreateForm } from './workspace/WorkspaceCreateForm'
import { WorkspaceDeleteConfirm } from './workspace/WorkspaceDeleteConfirm'
import { WorkspaceList } from './workspace/WorkspaceList'

const isHttp = (url: string): boolean => /^https?:\/\//i.test(url)

// 上端・左パネル（1段目・2段目、F15）・中央。中央の <main> にページの WebContentsView を重ねる
// （位置と大きさを IPC で Main に報告する。ADR-008）
function App(): React.JSX.Element {
  const { t } = useTranslation()
  const { state, create, switchTo, remove, refresh, notice, dismissNotice } = useWorkspaces()
  const [adding, setAdding] = useState(false)
  // 削除の確認を出している Workspace の id
  const [deletingId, setDeletingId] = useState<number | null>(null)
  // 起動したときの表示（F11）。Developer Home は、Workspace を選ぶ・作るまで出す
  const { view: startup, finish: finishStartup, showHome: showStartupHome } = useStartupView()
  const [switchError, setSwitchError] = useState<IpcErrorCode>()
  const [panelView, setPanelView] = useState<PanelView>('tabs')
  const [collapsed, setCollapsed] = useSidePanelCollapsed()
  const workspaceId = state.status === 'ready' ? state.currentId : null
  const downloads = useDownloads(workspaceId, panelView === 'downloads' && !collapsed)
  const bookmarks = useBookmarks()
  const [bookmarkMessage, setBookmarkMessage] = useState<string>()
  const tabs = useTabs(workspaceId)
  // タブを別の Workspace へ移す（F17）。終わったら、タブ列と Workspace の一覧を読み直す
  const move = useMoveTab({
    workspaceId,
    onMoved: async () => {
      await Promise.all([tabs.refresh(), refresh()])
      // 移したタブは消えたので、フォーカスを選んでいるタブへ（body に落とさない）
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('.tab-row[aria-current="true"]')?.focus()
      )
    }
  })
  const permission = usePermissionPrompt(workspaceId, tabs.activeId ?? null)
  // 作成画面を閉じたら、フォーカスを左パネルの今の Workspace に戻す（キーボードで続けて操作できるように）。
  // 戻し先は作った（やめたときは今の）Workspace の id。その Workspace が「今の」になった描画の後（effect）で探す。
  // 作成画面を閉じる描画が、新しい一覧の描画より先に来ることがあり（負荷が高いとき）、
  // そのとき「今の」行を探すと前の Workspace に戻してしまう。rAF では描き直しより先に動くことがある
  const refocus = useRef<number | null>(null)
  useEffect(() => {
    if (refocus.current === null) return
    if (state.status !== 'ready' || state.currentId !== refocus.current) return
    refocus.current = null
    // 2段目を畳んでいるときは、1段目のボタンへ
    const row = document.querySelector<HTMLElement>('.workspace-row[aria-current="true"]')
    ;(row?.checkVisibility()
      ? row
      : document.querySelector<HTMLElement>('.activity-button')
    )?.focus()
  })
  // 削除の確認を出している間は、上端・1段目・2段目を操作できなくする（inert）。
  // ほかの Workspace の削除・切り替え・タブの操作と競合させず、フォーカスも確認の中に留める
  // （対象が一覧から消えていたら、確認は出ていないので外す）
  const confirming =
    state.status === 'ready' && !adding && state.workspaces.some((w) => w.id === deletingId)
  useEffect(() => {
    for (const element of document.querySelectorAll('.top-bar, .activity-bar, .left-panel')) {
      element.toggleAttribute('inert', confirming)
    }
  })
  // 2段目を畳んだとき、フォーカスが2段目の中にあったら1段目のボタンへ移す（見えない所に残さない）
  useEffect(() => {
    if (collapsed && document.activeElement?.closest('.left-panel')) {
      document.querySelector<HTMLElement>('.activity-button')?.focus()
    }
  }, [collapsed])

  // 今のページをブックマークに足す（Cmd/Ctrl+D と、パネルのボタン）。http・https のページだけ
  const activeTab = tabs.tabs.find((tab) => tab.id === tabs.activeId)
  const activePage = activeTab && tabs.pages[activeTab.id]
  const control = (action: 'back' | 'forward' | 'reload' | 'stop'): void =>
    void tabs.run((api, ws) => api.control(ws, activeTab!.id, action))
  // Workspace の行を選ぶ・ショートカット（Ctrl/Alt+1〜9）で、Workspace を切り替える
  const switchWorkspace = async (id: number): Promise<void> => {
    setAdding(false)
    setDeletingId(null)
    const code = await switchTo(id)
    // Developer Home は、開けてから閉じる（失敗したら Home に留めて知らせる）
    if (!code) finishStartup()
    setSwitchError(code)
  }
  // ショートカットは、左パネルの並び順の n 番目へ。削除の確認の間は切り替えない（確認と競合させない。
  // 左パネルは inert にしてあるのと同じ）。今の Workspace の番号でも、作成画面・起動の画面が出ているときは、
  // 行を選ぶのと同じに、閉じてページへ戻る
  const switchByNumber = (n: number): void => {
    if (state.status !== 'ready' || confirming) return
    const target = state.workspaces[n - 1]
    if (!target) return
    const plain = startup === 'done' && !adding
    if (target.id !== state.currentId || !plain) void switchWorkspace(target.id)
  }
  const switchByNumberRef = useRef(switchByNumber)
  useEffect(() => {
    switchByNumberRef.current = switchByNumber
  })
  // 統合検索欄の候補の一覧を置く場所（中央の列の先頭。一覧の分だけページが下がる）
  const [omniboxSlot, setOmniboxSlot] = useState<HTMLElement | null>(null)
  // 別のタブ・Workspace へ移る候補を選んだ（F10）。別の Workspace のものは、先にその Workspace へ切り替える
  // （別の Mode の URL を、今の Workspace のログインで開かないため）。切り替えに失敗したら何もしない
  const pickCandidate = async (c: Candidate): Promise<boolean> => {
    const target = c.workspaceId
    if (target === undefined) return false
    if (c.otherWorkspace && (await switchTo(target))) return false
    if (c.kind === 'workspace') return true
    if (c.kind === 'tab' && c.tabId !== undefined) {
      const result = await window.trueful.tab.activate(target, c.tabId)
      await tabs.refresh()
      return result.ok
    }
    // 別の Workspace の履歴: その Workspace に新しいタブを作って開く
    if (c.url === undefined) return false
    const created = await window.trueful.tab.create(target)
    if (!created.ok) return false
    const opened = await window.trueful.tab.navigate(target, created.value.id, c.url)
    await tabs.refresh()
    return opened.ok
  }
  const addingPage = useRef(false)
  const addCurrentPage = async (): Promise<void> => {
    // 作成画面・削除の確認が開いているとき・進行中・http・https でないページは追加しない（ボタンとショートカットで同じ）
    if (adding || confirming || addingPage.current) return
    const url = activeTab?.url ?? ''
    if (!activeTab || !isHttp(url)) return setBookmarkMessage(t('bookmark.addUnsupported'))
    addingPage.current = true
    try {
      const ok = await bookmarks.add(activeTab.title || url, url)
      setBookmarkMessage(t(ok ? 'bookmark.added' : 'bookmark.addFailed'))
    } finally {
      addingPage.current = false
    }
  }
  const addCurrentPageRef = useRef(addCurrentPage)
  useEffect(() => {
    addCurrentPageRef.current = addCurrentPage
  })
  useEffect(
    () =>
      window.trueful.ui.onCommand((command) => {
        if (command === 'bookmark-page') void addCurrentPageRef.current()
        const n = /^workspace-switch-([1-9])$/.exec(command)?.[1]
        if (n) switchByNumberRef.current(Number(n))
      }),
    []
  )

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

  const closeCreate = (focusId: number | null): void => {
    refocus.current = focusId
    setAdding(false)
  }
  // 削除の確認。対象が一覧から消えていたら（別の操作で消えたなど）出さない
  const deleting = showCreate ? undefined : state.workspaces.find((w) => w.id === deletingId)
  const closeDelete = (focusId: number | null): void => {
    refocus.current = focusId
    setDeletingId(null)
  }
  const showHome =
    (startup === 'home' || startup === 'home-after-crash') && !showCreate && deleting === undefined
  const showCrash = startup === 'crash' && !showCreate && deleting === undefined
  // 作成画面・削除の確認・Developer Home を出している間と、起動の表示が決まるまでは、ページを隠す
  const pageHidden = showCreate || deleting !== undefined || startup !== 'done'

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
        {!pageHidden && (
          <AddressBar
            key={activeTab?.id}
            tab={activeTab}
            page={activePage}
            workspaceId={workspaceId}
            workspaceName={(id) => state.workspaces.find((w) => w.id === id)?.name}
            slot={omniboxSlot}
            onPick={pickCandidate}
            onNavigate={(input) => tabs.run((api, ws) => api.navigate(ws, activeTab!.id, input))}
            onControl={control}
          />
        )}
        {/* ページ（WebContentsView）は UI の上に重なるので、エラーはページの外（上端）に出す */}
        {switchError && !pageHidden && (
          <p role="alert" className="switch-error">
            {t(`error.${switchError}`)}
          </p>
        )}
        {/* 自動で休止したことの事後の知らせ（ADR-011）。ページの外（上端）に出し、読み上げる */}
        {/* 読み上げの領域は常に置き、中身だけ出し入れする。閉じるボタンは領域の外 */}
        <div className={notice.length > 0 ? 'dormant-notice' : undefined}>
          <p role="status" aria-live="polite">
            {notice.length > 0 && t('workspace.dormantNotice', { names: notice.join('」「') })}
          </p>
          {notice.length > 0 && (
            <button type="button" className="dormant-notice-close" onClick={dismissNotice}>
              {t('workspace.dormantNoticeClose')}
            </button>
          )}
        </div>
        {/* 起動のときの知らせ（壊れた DB を戻した。F12） */}
        <StartupNotice />
        {/* 権限の確認が出たことの読み上げ（領域は常に置き、中身だけ入れ替える） */}
        <p role="status" aria-live="polite" className="visually-hidden">
          {permission.prompt &&
            !pageHidden &&
            permissionMessage(t, permission.prompt.origin, permission.prompt.permission)}
        </p>
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
      {panelView === 'downloads' && !adding ? (
        <DownloadPanel
          downloads={downloads.downloads}
          onPause={downloads.pause}
          onResume={downloads.resume}
          onCancel={downloads.cancel}
          onShowInFolder={downloads.showInFolder}
        />
      ) : panelView === 'bookmarks' ? (
        <BookmarkPanel
          bookmarks={bookmarks.bookmarks}
          canAddPage={!showCreate && isHttp(activeTab?.url ?? '')}
          message={bookmarkMessage}
          onOpen={(url) => {
            // 保存されている URL でも、http・https 以外は開かない
            if (activeTab && isHttp(url)) {
              void tabs.run((api, ws) => api.navigate(ws, activeTab.id, url))
            }
          }}
          onAddPage={() => void addCurrentPage()}
          onUpdate={bookmarks.update}
          onRemove={(id) => void bookmarks.remove(id)}
          onImport={(source) =>
            void bookmarks.importFrom(source).then((outcome) => {
              // 結果は、追加の知らせと同じ1つの場所に出す（ファイルを選ばなかったときは消す）
              const key = outcome ? importMessageKey(outcome) : 'bookmark.importUnreadable'
              const counts = outcome?.status === 'imported' ? outcome : { imported: 0, failed: 0 }
              setBookmarkMessage(key ? t(key, counts) : undefined)
            })
          }
        />
      ) : (
        <WorkspaceList
          workspaces={state.workspaces}
          currentId={state.currentId}
          onSwitch={switchWorkspace}
          onAdd={() => {
            setSwitchError(undefined)
            setDeletingId(null)
            setAdding(true)
          }}
          onDelete={(id) => {
            setSwitchError(undefined)
            setAdding(false)
            setDeletingId(id)
          }}
        >
          {/* Developer Home・異常終了の確認の間はタブ列を出さない（選ぶと、見えないままページを読み込むため） */}
          {!showCreate && !showHome && !showCrash && panelView === 'tabs' && (
            <>
              <TabList
                tabs={tabs.tabs}
                activeId={tabs.activeId}
                discardedIds={tabs.discardedIds}
                onActivate={(id) => void tabs.run((api, ws) => api.activate(ws, id))}
                onClose={(id) => void tabs.run((api, ws) => api.close(ws, id))}
                onCreate={() => void tabs.run((api, ws) => api.create(ws))}
                destinations={state.workspaces.filter((w) => w.id !== state.currentId)}
                onMove={(tab, to) => void move.request(tab, to)}
              />
              {move.pending && (
                <MoveTabConfirm
                  title={tabTitle(t, move.pending.tab)}
                  destination={move.pending.to}
                  onConfirm={(dontAsk) => void move.confirm(dontAsk)}
                  onCancel={() => {
                    move.cancel()
                    // フォーカスを、メニューを開いたタブに戻す（なければ選んでいるタブ。body に落とさない）
                    const id = move.pending?.tab.id
                    ;(
                      document.querySelector<HTMLElement>(`.tab-row[data-tab-id="${id}"]`) ??
                      document.querySelector<HTMLElement>('.tab-row[aria-current="true"]')
                    )?.focus()
                  }}
                />
              )}
              {/* 移した結果の読み上げ（領域は常に置き、中身だけ入れる） */}
              <p
                role="status"
                aria-live="polite"
                className={move.status ? 'tab-move-status' : 'visually-hidden'}
              >
                {move.status}
              </p>
            </>
          )}
        </WorkspaceList>
      )}
      <main className={pageHidden ? 'content center' : 'content'}>
        {deleting ? (
          <WorkspaceDeleteConfirm
            key={deleting.id}
            name={deleting.name}
            onDelete={async () => {
              const result = await remove(deleting.id)
              if (!result.ok) return result.code
              // 閉じたら、フォーカスを今の Workspace の行へ（最後の1つを消したら、作成画面の名前の欄）
              closeDelete(result.currentId)
              return undefined
            }}
            onCancel={() => closeDelete(state.currentId)}
          />
        ) : showCreate ? (
          <WorkspaceCreateForm
            onCreate={async (name, mode, requestId) => {
              const result = await create(name, mode, requestId)
              if (!result.ok) return result.code
              // 作ったら、その Workspace を開いている（起動の画面は閉じる）
              finishStartup()
              closeCreate(result.id)
              return undefined
            }}
            onCancel={state.workspaces.length > 0 ? () => closeCreate(state.currentId) : undefined}
          />
        ) : showCrash ? (
          <CrashRestorePrompt
            onRestore={async () => {
              // 今の Workspace がなければ（ふつうは起きない）、Developer Home から選んでもらう
              if (state.currentId === null) {
                showStartupHome()
                return undefined
              }
              // 今の Workspace へ切り替えると、Main がその選択中のタブを読み込む
              const code = await switchTo(state.currentId)
              if (!code) {
                refocus.current = state.currentId
                finishStartup()
              }
              return code
            }}
            onSkip={showStartupHome}
          />
        ) : showHome ? (
          <DeveloperHome
            workspaces={state.workspaces}
            error={switchError}
            afterCrash={startup === 'home-after-crash'}
            onOpen={(id) => {
              refocus.current = id
              void switchWorkspace(id)
            }}
            // 作成画面が前に出る。作れば Home は閉じ、やめれば Home に戻る（ページは読み込んでいないため）
            onAdd={() => setAdding(true)}
          />
        ) : startup === 'pending' ? null : (
          <>
            <div ref={setOmniboxSlot} />
            {permission.prompt && (
              <PermissionBar
                key={permission.prompt.id}
                prompt={permission.prompt}
                onAnswer={permission.answer}
              />
            )}
            <PageArea>
              {activePage?.error && (
                <ErrorScreen
                  error={activePage.error}
                  canGoBack={activePage.canGoBack}
                  onReload={() => control('reload')}
                  onBack={() => control('back')}
                />
              )}
            </PageArea>
          </>
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
