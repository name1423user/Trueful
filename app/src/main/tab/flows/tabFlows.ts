import type { DatabaseSync } from 'node:sqlite'
import { inTransaction } from '../../db/services/transaction'
import {
  compactPositions,
  deleteTab,
  getActiveTab,
  getTab,
  insertTab,
  latestActiveTime,
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

// その Workspace のタブを返す。ない・別の Workspace のタブなら TabNotFoundError
export function getOwnedTab(db: DatabaseSync, workspaceId: number, id: number): Tab {
  const tab = getTab(db, id)
  if (!tab || tab.workspaceId !== workspaceId) throw new TabNotFoundError(id)
  return tab
}

// タブ列の様子（Renderer に返す形）
export type TabState = { tabs: Tab[]; activeId: number | null }

// 閉じたタブの控え（Cmd/Ctrl+Shift+T で戻す）。DB には持たず、Workspace ごとにメモリだけに持つ
// （再起動をまたぐ必要がない。data-schema.md の設計の判断）。index は閉じたときに左から何番目だったか
type ClosedTab = { url: string; title: string; index: number }
const CLOSED_TABS_LIMIT = 25

// タブの作成・閉じる・閉じたタブを戻す・選択（F02）。閉じたタブの控えを持つので、アプリで1つだけ作る。
// タブの並び（position）は、いつも 0, 1, 2, … にそろえる
export class TabFlows {
  private readonly closed = new Map<number, ClosedTab[]>()

  constructor(private readonly now: () => number = Date.now) {}

  // 選択の時刻。同じミリ秒の操作や時計の巻き戻りでも、後の操作が必ず新しくなるようにする
  // （選択中のタブ = 最後に選んだ時刻が最大のタブ、なので）
  private stamp(db: DatabaseSync, workspaceId: number): number {
    return Math.max(this.now(), (latestActiveTime(db, workspaceId) ?? -1) + 1)
  }

  // タブ列を返す。タブが1つもなければ（このタブの仕組みより前に作った Workspace など）空のタブを開く
  // （Workspace にはいつもタブが1つ以上ある）
  list(db: DatabaseSync, workspaceId: number): TabState {
    return inTransaction(db, () => {
      if (listTabs(db, workspaceId).length === 0) this.create(db, workspaceId)
      return this.state(db, workspaceId)
    })
  }

  // 新しいタブを一番右に開き、選択する（Cmd/Ctrl+T）
  create(db: DatabaseSync, workspaceId: number, url = NEW_TAB_URL): Tab {
    return insertTab(db, { workspaceId, url }, this.stamp(db, workspaceId))
  }

  // タブを閉じる（Cmd/Ctrl+W）。選択中のタブを閉じたら、その前に選んでいたタブを選ぶ（使った順。
  // ipc-spec.md）。最後の1つを閉じたら、空のタブを1つ開く。空のタブは控えに積まない
  close(db: DatabaseSync, workspaceId: number, id: number): TabState {
    const tab = getOwnedTab(db, workspaceId, id)
    const index = listTabs(db, workspaceId).findIndex((t) => t.id === id)
    const state = inTransaction(db, () => {
      deleteTab(db, id)
      compactPositions(db, workspaceId)
      if (listTabs(db, workspaceId).length === 0) this.create(db, workspaceId)
      return this.state(db, workspaceId)
    })
    if (tab.url !== NEW_TAB_URL) {
      const stack = this.closed.get(workspaceId) ?? []
      stack.push({ url: tab.url, title: tab.title, index })
      if (stack.length > CLOSED_TABS_LIMIT) stack.shift()
      this.closed.set(workspaceId, stack)
    }
    return state
  }

  // 最後に閉じたタブを、閉じたときと同じ「左から何番目」に戻して選択する（Cmd/Ctrl+Shift+T）。
  // タブが減っていたら一番右に入れる。控えがなければ undefined
  reopenClosed(db: DatabaseSync, workspaceId: number): Tab | undefined {
    const stack = this.closed.get(workspaceId)
    const closed = stack?.at(-1)
    if (!stack || !closed) return undefined
    const reopened = inTransaction(db, () => {
      const position = Math.min(closed.index, listTabs(db, workspaceId).length)
      const { url, title } = closed
      return insertTab(db, { workspaceId, url, title, position }, this.stamp(db, workspaceId))
    })
    // 戻せてから控えを外す（失敗したら、控えは残る）
    stack.pop()
    return reopened
  }

  // タブを選ぶ
  activate(db: DatabaseSync, workspaceId: number, id: number): Tab {
    getOwnedTab(db, workspaceId, id)
    touchTab(db, id, this.stamp(db, workspaceId))
    return getTab(db, id)!
  }

  private state(db: DatabaseSync, workspaceId: number): TabState {
    return { tabs: listTabs(db, workspaceId), activeId: getActiveTab(db, workspaceId)?.id ?? null }
  }
}
