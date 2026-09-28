import type { DatabaseSync } from 'node:sqlite'
import {
  deleteTab,
  getActiveTab,
  getTab,
  insertTab,
  listTabs,
  NEW_TAB_URL,
  touchTab,
  type Tab
} from '../services/tabDB'

export class TabNotFoundError extends Error {
  constructor(readonly id: number) {
    super(`タブ ${id} がない`)
    this.name = 'TabNotFoundError'
  }
}

// タブ列の様子（Renderer に返す形）
export type TabState = { tabs: Tab[]; activeId: number | null }

export function getTabState(db: DatabaseSync, workspaceId: number): TabState {
  return { tabs: listTabs(db, workspaceId), activeId: getActiveTab(db, workspaceId)?.id ?? null }
}

// 閉じたタブの控え（Cmd/Ctrl+Shift+T で戻す）。DB には持たず、Workspace ごとにメモリだけに持つ
// （再起動をまたぐ必要がない。data-schema.md の設計の判断）
type ClosedTab = Pick<Tab, 'url' | 'title' | 'position'>
const CLOSED_TABS_LIMIT = 25

// 1つのトランザクションで実行する（途中で失敗したら何も残さない）
function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (e) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw e
  }
}

// タブの作成・閉じる・閉じたタブを戻す・選択（F02）。閉じたタブの控えを持つので、アプリで1つだけ作る
export class TabFlows {
  private readonly closed = new Map<number, ClosedTab[]>()

  constructor(private readonly now: () => number = Date.now) {}

  // 新しいタブを一番右に開き、選択する（Cmd/Ctrl+T）
  create(db: DatabaseSync, workspaceId: number, url = NEW_TAB_URL): Tab {
    return insertTab(db, { workspaceId, url }, this.now())
  }

  // タブを閉じる（Cmd/Ctrl+W）。選択中のタブを閉じたら、その前に選んでいたタブを選ぶ。
  // 最後の1つを閉じたら、空のタブを1つ開く（Workspace にはいつもタブが1つ以上ある）
  close(db: DatabaseSync, id: number): TabState {
    const tab = getTab(db, id)
    if (!tab) throw new TabNotFoundError(id)
    const state = inTransaction(db, () => {
      deleteTab(db, id)
      if (listTabs(db, tab.workspaceId).length === 0) this.create(db, tab.workspaceId)
      return getTabState(db, tab.workspaceId)
    })
    const stack = this.closed.get(tab.workspaceId) ?? []
    stack.push({ url: tab.url, title: tab.title, position: tab.position })
    if (stack.length > CLOSED_TABS_LIMIT) stack.shift()
    this.closed.set(tab.workspaceId, stack)
    return state
  }

  // 最後に閉じたタブを、元の位置に戻して選択する（Cmd/Ctrl+Shift+T）。控えがなければ undefined
  reopenClosed(db: DatabaseSync, workspaceId: number): Tab | undefined {
    const closed = this.closed.get(workspaceId)?.pop()
    if (!closed) return undefined
    return inTransaction(db, () => insertTab(db, { workspaceId, ...closed }, this.now()))
  }

  // タブを選ぶ
  activate(db: DatabaseSync, id: number): Tab {
    if (!touchTab(db, id, this.now())) throw new TabNotFoundError(id)
    return getTab(db, id)!
  }

  // Workspace を消したときなどに、その控えを捨てる
  forgetWorkspace(workspaceId: number): void {
    this.closed.delete(workspaceId)
  }
}
