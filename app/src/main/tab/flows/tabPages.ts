import type { DatabaseSync } from 'node:sqlite'
import { getTab, updateTabPage, type Tab } from '../services/tabDB'
import type { PageState, TabViews } from '../services/tabViews'
import { resolveInput, type Shortcut } from '../services/urlInput'
import { TabNotFoundError, type TabFlows } from './tabFlows'

type Notify = {
  // ページの様子が変わった（アドレスバー・戻る・進む・タイトル）
  page: (tabId: number, page: PageState) => void
}

// タブの操作と、ページの表示（TabViews）を合わせる進行役（F02）
export class TabPages {
  constructor(
    private readonly tabs: TabFlows,
    private readonly views: TabViews,
    private readonly getDb: () => DatabaseSync | undefined,
    private readonly notify: Notify
  ) {}

  // Workspace の選択中のタブを表示する（Workspace の切り替え、タブの作成・選択・閉じるの後）
  showActive(db: DatabaseSync, workspaceId: number): void {
    const { tabs, activeId } = this.tabs.list(db, workspaceId)
    const active = tabs.find((t) => t.id === activeId)
    if (active) this.views.show(active)
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
    if (wc) void wc.loadURL(url).catch(() => {})
    else this.showActive(db, workspaceId)
    return getTab(db, id)!
  }

  // TabViews から: ページが移動した・タイトルが変わった
  pageChanged(tabId: number, page: PageState): void {
    const db = this.getDb()
    if (db && getTab(db, tabId) && page.url) updateTabPage(db, tabId, page)
    this.notify.page(tabId, page)
  }

  private owned(db: DatabaseSync, workspaceId: number, id: number): Tab {
    const tab = getTab(db, id)
    if (!tab || tab.workspaceId !== workspaceId) throw new TabNotFoundError(id)
    return tab
  }
}
