import type { DatabaseSync } from 'node:sqlite'
import {
  getCurrentWorkspaceId,
  getWorkspace,
  listWorkspaces
} from '../../workspace/services/workspaceDB'
import {
  historyUrl,
  isHistoryUrl,
  recordVisit,
  updateHistoryTitle
} from '../../history/services/historyDB'
import { getTab, listTabs, updateTabPage, updateTabScroll, type Tab } from '../services/tabDB'
import type { PageState, TabViews } from '../services/tabViews'
import { isAllowedPageUrl, resolveInput, type Shortcut } from '../services/urlInput'
import { getOwnedTab, type TabFlows, type TabState } from './tabFlows'

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
    // 休止の前のスクロール位置は、ページを作り直したときに1回だけ戻す
    if (active && this.views.show(active) && active.scrollY > 0) {
      updateTabScroll(db, active.id, 0)
    }
  }

  // 休止した Workspace のページを、スクロール位置を記録してから破棄する（F01。URL は DB に残っている）
  async releaseDormant(db: DatabaseSync): Promise<void> {
    for (const workspace of listWorkspaces(db).filter((w) => w.status === 'dormant')) {
      for (const tab of listTabs(db, workspace.id)) {
        if (!this.views.webContents(tab.id)) continue
        // 待っている間に復帰した（切り替えで開いた）Workspace のページは破棄しない
        const stillDormant = (): boolean =>
          db.isOpen && getWorkspace(db, workspace.id)?.status === 'dormant'
        if (!stillDormant()) break
        const y = await this.views.release(tab.id, stillDormant)
        if (y !== undefined && db.isOpen && getTab(db, tab.id)) updateTabScroll(db, tab.id, y)
      }
    }
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
    // 終了の途中（DB を閉じた後）なら知らせない
    if (!db?.isOpen) return
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
    const tab = getOwnedTab(db, workspaceId, id)
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
    this.lastRecorded.delete(id)
    this.showActive(db, workspaceId)
    return state
  }

  // タブを別の Workspace へ移したあと、元のタブのページを破棄して、記録の控えを忘れる
  // （タブの id は使い回されうる。控えが残ると、同じ id の別のタブの最初の訪問を記録し損ねる）
  forget(id: number): void {
    this.views.destroy(id)
    this.lastRecorded.delete(id)
  }

  // 戻る・進む・再読み込み・停止（ページがまだないタブでは何もしない）
  control(db: DatabaseSync, workspaceId: number, id: number, action: PageAction): void {
    getOwnedTab(db, workspaceId, id)
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

  // Cmd/Ctrl+1〜9（Chrome と同じ）。今の Workspace の、左から n 番目のタブを選ぶ。9 は最後のタブ。
  // タブの数より大きい番号なら何もしない
  selectNth(db: DatabaseSync, n: number): void {
    const workspaceId = getCurrentWorkspaceId(db)
    if (workspaceId === null) return
    const { tabs } = this.tabs.list(db, workspaceId)
    const tab = n === 9 ? tabs.at(-1) : tabs[n - 1]
    if (!tab) return
    this.tabs.activate(db, workspaceId, tab.id)
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
    if (committed && isAllowedPageUrl(page.url)) {
      updateTabPage(db, tabId, page)
      this.recordHistory(db, tabId, page)
    }
    this.notify.page(tabId, page)
  }

  // 履歴（F09）。タブが別の URL へ移ったら、訪問を1回記録する（再読み込みや同じ URL のままの題名の更新は数えない）。
  // 移った時点の題名は前のページのことがあるので、題名は空で記録し、決まってから更新する
  private readonly lastRecorded = new Map<number, string>()
  // フラグメント（#以降）だけの移動は数えない。履歴の失敗で、ページの表示や通知を止めない
  private recordHistory(db: DatabaseSync, tabId: number, page: PageState): void {
    try {
      const tab = getTab(db, tabId)
      if (!tab || !isHistoryUrl(page.url)) return
      const url = historyUrl(page.url)
      if (this.lastRecorded.get(tabId) === url) {
        updateHistoryTitle(db, tab.workspaceId, url, page.title)
        return
      }
      this.lastRecorded.set(tabId, url)
      recordVisit(db, { workspaceId: tab.workspaceId, url, title: '', now: Date.now() })
    } catch (e) {
      console.error('[main] 履歴を記録できなかった', e)
    }
  }
}
