import type { DatabaseSync } from 'node:sqlite'
import { getCurrentWorkspaceId } from '../../workspace/services/workspaceDB'
import { getTab, updateTabPage, type Tab } from '../services/tabDB'
import type { PageState, TabViews } from '../services/tabViews'
import { isAllowedPageUrl, resolveInput, type Shortcut } from '../services/urlInput'
import { TabNotFoundError, type TabFlows, type TabState } from './tabFlows'

export type PageAction = 'back' | 'forward' | 'reload' | 'stop'

// tab:list の返事。discardedIds は、上限のためにページを破棄したタブ（F02）
export type TabListState = TabState & { discardedIds: number[] }

type Notify = {
  // ページの様子が変わった（アドレスバー・戻る・進む・タイトル）
  page: (tabId: number, page: PageState) => void
  // タブ列が変わった（ページが新しいタブを開いた・ショートカットなど、Renderer の invoke ではない変化）
  tabsChanged: (workspaceId: number) => void
}

// タブの操作と、ページの表示（TabViews）を合わせる進行役（F02）
export class TabPages {
  constructor(
    private readonly tabs: TabFlows,
    private readonly views: TabViews,
    private readonly getDb: () => DatabaseSync | undefined,
    private readonly notify: Notify
  ) {}

  // Workspace の選択中のタブを表示する（Workspace の切り替え、タブの作成・選択・閉じるの後）。
  // 今の Workspace でなければ表示しない（別の Workspace のページを重ねない）
  showActive(db: DatabaseSync, workspaceId: number): void {
    if (getCurrentWorkspaceId(db) !== workspaceId) return
    const { tabs, activeId } = this.tabs.list(db, workspaceId)
    const active = tabs.find((t) => t.id === activeId)
    if (active) this.views.show(active)
  }

  // タブ列と、上限のためにページを破棄したタブ（画面では薄く出す。F02・F15）
  list(db: DatabaseSync, workspaceId: number): TabListState {
    const state = this.tabs.list(db, workspaceId)
    return {
      ...state,
      discardedIds: state.tabs.filter((t) => this.views.isDiscarded(t.id)).map((t) => t.id)
    }
  }

  // TabViews から: 上限のためにページを破棄した → そのタブの Workspace のタブ列が変わったと知らせる
  discarded(tabIds: number[]): void {
    const db = this.getDb()
    if (!db) return
    const workspaceIds = new Set(tabIds.map((id) => getTab(db, id)?.workspaceId))
    for (const workspaceId of workspaceIds) {
      if (workspaceId !== undefined) this.notify.tabsChanged(workspaceId)
    }
  }

  // アドレスバーの入力を開く
  navigate(
    db: DatabaseSync,
    workspaceId: number,
    id: number,
    input: string,
    shortcuts: Shortcut[]
  ): Tab {
    const tab = this.owned(db, workspaceId, id)
    const url = resolveInput(input, shortcuts)
    updateTabPage(db, id, { url, title: tab.title })
    const wc = this.views.webContents(id)
    if (wc && isAllowedPageUrl(url)) void wc.loadURL(url).catch(() => {})
    else this.showActive(db, workspaceId)
    return getTab(db, id)!
  }

  // タブを閉じて、そのページを破棄し、次に選ばれたタブを表示する
  close(db: DatabaseSync, workspaceId: number, id: number): TabState {
    const state = this.tabs.close(db, workspaceId, id)
    this.views.destroy(id)
    this.showActive(db, workspaceId)
    return state
  }

  // 戻る・進む・再読み込み・停止（ページがまだないタブでは何もしない）
  control(db: DatabaseSync, workspaceId: number, id: number, action: PageAction): void {
    this.owned(db, workspaceId, id)
    const wc = this.views.webContents(id)
    if (!wc) return
    if (action === 'back') wc.navigationHistory.goBack()
    else if (action === 'forward') wc.navigationHistory.goForward()
    else if (action === 'reload') wc.reload()
    else wc.stop()
  }

  // メニューのショートカット（Cmd/Ctrl+T・W・Shift+T・R）。今の Workspace に対して行い、タブ列の変化を知らせる
  command(db: DatabaseSync, command: 'new' | 'close' | 'reopen' | 'reload'): void {
    const workspaceId = getCurrentWorkspaceId(db)
    if (workspaceId === null) return
    if (command === 'reload') {
      const { activeId } = this.tabs.list(db, workspaceId)
      if (activeId !== null) this.control(db, workspaceId, activeId, 'reload')
      return
    }
    if (command === 'new') this.tabs.create(db, workspaceId)
    else if (command === 'reopen') this.tabs.reopenClosed(db, workspaceId)
    else {
      const { activeId } = this.tabs.list(db, workspaceId)
      if (activeId !== null) this.close(db, workspaceId, activeId)
    }
    this.showActive(db, workspaceId)
    this.notify.tabsChanged(workspaceId)
  }

  // TabViews から: ページが新しいウィンドウを開こうとした → 同じ Workspace の新しいタブで開く
  // background（Cmd/Ctrl+クリック・中クリック）のときは、開いたタブを選ばない
  openRequested(tabId: number, url: string, background = false): void {
    const db = this.getDb()
    const tab = db && getTab(db, tabId)
    if (!db || !tab || !/^https?:/i.test(url) || !isAllowedPageUrl(url)) return
    const { activeId } = this.tabs.list(db, tab.workspaceId)
    this.tabs.create(db, tab.workspaceId, url)
    if (background && activeId !== null) this.tabs.activate(db, tab.workspaceId, activeId)
    this.showActive(db, tab.workspaceId)
    this.notify.tabsChanged(tab.workspaceId)
  }

  // TabViews から: ページの様子が変わった。移動が確定したとき（committed）だけ URL とタイトルを記録する
  // （読み込み中の知らせの URL は前のページのことがあり、navigate で記録した行き先を上書きしてしまう）
  pageChanged(tabId: number, page: PageState, committed = true): void {
    const db = this.getDb()
    // 閉じたタブの知らせは記録も通知もしない
    if (!db || !getTab(db, tabId)) return
    // 開いてよい URL だけを記録する（file: へのリダイレクトは Chromium が止めてエラーページになるが、
    // その URL は file: のまま。復元のときに開かないよう、記録しない）
    if (committed && isAllowedPageUrl(page.url)) updateTabPage(db, tabId, page)
    this.notify.page(tabId, page)
  }

  private owned(db: DatabaseSync, workspaceId: number, id: number): Tab {
    const tab = getTab(db, id)
    if (!tab || tab.workspaceId !== workspaceId) throw new TabNotFoundError(id)
    return tab
  }
}
