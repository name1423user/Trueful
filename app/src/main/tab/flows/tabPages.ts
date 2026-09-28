import type { DatabaseSync } from 'node:sqlite'
import { getCurrentWorkspaceId } from '../../workspace/services/workspaceDB'
import { getTab, updateTabPage, type Tab } from '../services/tabDB'
import type { PageState, TabViews } from '../services/tabViews'
import { isAllowedPageUrl, resolveInput, type Shortcut } from '../services/urlInput'
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

  // Workspace の選択中のタブを表示する（Workspace の切り替え、タブの作成・選択・閉じるの後）。
  // 今の Workspace でなければ表示しない（別の Workspace のページを重ねない）
  showActive(db: DatabaseSync, workspaceId: number): void {
    if (getCurrentWorkspaceId(db) !== workspaceId) return
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
    if (wc && isAllowedPageUrl(url)) void wc.loadURL(url).catch(() => {})
    else this.showActive(db, workspaceId)
    return getTab(db, id)!
  }

  // TabViews から: ページの様子が変わった。移動が確定したとき（committed）だけ URL とタイトルを記録する
  // （読み込み中の知らせの URL は前のページのことがあり、navigate で記録した行き先を上書きしてしまう）
  pageChanged(tabId: number, page: PageState, committed = true): void {
    const db = this.getDb()
    // 閉じたタブの知らせは記録も通知もしない
    if (!db || !getTab(db, tabId)) return
    if (committed && page.url) updateTabPage(db, tabId, page)
    this.notify.page(tabId, page)
  }

  private owned(db: DatabaseSync, workspaceId: number, id: number): Tab {
    const tab = getTab(db, id)
    if (!tab || tab.workspaceId !== workspaceId) throw new TabNotFoundError(id)
    return tab
  }
}
