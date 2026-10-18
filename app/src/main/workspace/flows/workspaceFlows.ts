import type { DatabaseSync } from 'node:sqlite'
import { inTransaction } from '../../db/services/transaction'
import { getOwnedTab } from '../../tab/flows/tabFlows'
import {
  compactPositions,
  deleteTab,
  insertTab,
  latestActiveTime,
  listTabs,
  NEW_TAB_URL,
  type Tab
} from '../../tab/services/tabDB'
import {
  deleteWorkspaceRow,
  getCurrentWorkspaceId,
  getWorkspace,
  insertWorkspace,
  listWorkspaces,
  setCurrentWorkspaceId,
  setWorkspaceActive,
  setWorkspaceDormant,
  skipWorkspaceId,
  touchWorkspace,
  type Workspace,
  type WorkspaceMode
} from '../services/workspaceDB'
import { buildSnapshot, insertSnapshot } from '../services/workspaceSnapshot'
import { MAX_ACTIVE_WORKSPACES, workspacesToDormant } from '../services/workspaceLimit'

export class WorkspaceNotFoundError extends Error {
  constructor(readonly id: number) {
    super(`Workspace ${id} がない`)
    this.name = 'WorkspaceNotFoundError'
  }
}

// Workspace を作り、そのまま開く（F01）。作ると空のタブが1つ開く。
// prepare（パーティションの残りの削除と、マニフェストの書き込み）は行を足したのと同じトランザクションの中で行う。
// prepare が失敗したら行も取り消す（DB にあるのにファイルがない Workspace を作らない）。
// そのときは、その id を飛ばす（同じ id で同じ残りのフォルダに当たって、失敗し続けないため）。
// prepare は同期に限る（同じトランザクションの中で動くため）。非同期の準備が要るときは、
// トランザクションの外に出し、「同じ依頼が同時に2回届いても1つだけ作る」テストを非同期で戻す。
// 同じ requestId の依頼がもう一度届いたら（ボタンの二度押し・送り直し）、作らずに最初の結果を返す。
// requestId が同じなら、名前や Mode の違いは見ない（ipc-spec.md）
export function createWorkspaceFlow(
  prepare: (workspace: Workspace) => void = () => {}
): (
  db: DatabaseSync,
  input: { name: string; mode: WorkspaceMode; requestId: string },
  now?: number
) => Promise<Workspace> {
  const requests = new Map<string, Promise<Workspace>>()
  return (db, { name, mode, requestId }, now = Date.now()) => {
    const earlier = requests.get(requestId)
    if (earlier) return earlier
    const creating = (async () => {
      let preparing: number | undefined
      try {
        return inTransaction(db, () => {
          const created = insertWorkspace(db, { name, mode }, now)
          setCurrentWorkspaceId(db, created.id)
          insertTab(db, { workspaceId: created.id, url: NEW_TAB_URL }, now)
          limitActiveWorkspaces(db, created.id, now)
          preparing = created.id
          prepare(created)
          return created
        })
      } catch (e) {
        if (preparing !== undefined) skipWorkspaceId(db, preparing)
        throw e
      }
    })()
    requests.set(requestId, creating)
    // 失敗した依頼は忘れる（送り直せば作り直す）
    creating.catch(() => requests.delete(requestId))
    // 覚えておく依頼の数を限る（二度押しを防げれば足りる）
    if (requests.size > 100) requests.delete(requests.keys().next().value!)
    return creating
  }
}

// Workspace を切り替える。最後に使った時刻を更新し、次の起動で開くものとして記録する。
// 休止していたら復帰させ、上限を超えたらほかの Workspace を休止にする
export function switchWorkspace(db: DatabaseSync, id: number, now = Date.now()): Workspace {
  return inTransaction(db, () => activateWorkspace(db, id, now))
}

function activateWorkspace(db: DatabaseSync, id: number, now: number): Workspace {
  if (!touchWorkspace(db, id, now)) throw new WorkspaceNotFoundError(id)
  setWorkspaceActive(db, id)
  setCurrentWorkspaceId(db, id)
  limitActiveWorkspaces(db, id, now)
  return getWorkspace(db, id)!
}

export class SameWorkspaceError extends Error {
  constructor(readonly id: number) {
    super(`移動先が同じ Workspace ${id}`)
    this.name = 'SameWorkspaceError'
  }
}

// タブを別の Workspace へ移す（F17）。移動先に同じ URL・タイトルのタブを開いて（そこで選ばれる）、元のタブは消す
// （閉じたタブの控えには積まない。移したのであって、閉じたのではない）。ページの実体は引き継がない
// （移動先は Cookie が別なので、読み込み直す）。移動先が休止していたら復帰させる（上限を超えたらほかを休止にする。
// 呼び出し側で休止したページを破棄する）。今の Workspace は変えない。元の Workspace が空になったら、空のタブを1つ開く。
// 全部1つのトランザクション（途中で失敗したら何も残さない）。返すのは、移動先のタブ
export function moveTabFlow(
  db: DatabaseSync,
  input: { tabId: number; fromWorkspaceId: number; toWorkspaceId: number },
  now = Date.now()
): Tab {
  const { tabId, fromWorkspaceId, toWorkspaceId } = input
  return inTransaction(db, () => {
    const tab = getOwnedTab(db, fromWorkspaceId, tabId)
    if (fromWorkspaceId === toWorkspaceId) throw new SameWorkspaceError(toWorkspaceId)
    const destination = getWorkspace(db, toWorkspaceId)
    if (!destination) throw new WorkspaceNotFoundError(toWorkspaceId)
    if (destination.status === 'dormant') {
      touchWorkspace(db, toWorkspaceId, now)
      setWorkspaceActive(db, toWorkspaceId)
      // 復帰させる Workspace と、見ている今の Workspace は休止にしない（画面に出ているページが消えるため）
      limitActiveWorkspaces(db, [toWorkspaceId, getCurrentWorkspaceId(db) ?? toWorkspaceId], now)
    }
    // 選択の時刻は、同じミリ秒の操作や時計の巻き戻りでも新しくなるようにする（TabFlows と同じ）
    const stamp = Math.max(now, (latestActiveTime(db, toWorkspaceId) ?? -1) + 1)
    const moved = insertTab(
      db,
      { workspaceId: toWorkspaceId, url: tab.url, title: tab.title },
      stamp
    )
    deleteTab(db, tabId)
    compactPositions(db, fromWorkspaceId)
    if (listTabs(db, fromWorkspaceId).length === 0) {
      insertTab(db, { workspaceId: fromWorkspaceId, url: NEW_TAB_URL }, now)
    }
    return moved
  })
}

// Workspace を削除する（F01）。スナップショットを書いてから行を消す（タブ・履歴などは外部キーで消える）。
// 今の Workspace を消したら、残りのうち最後に使ったものへ移る（なければ今の Workspace なし）。
// ページ（WebContentsView）とパーティションのデータの片付けは、呼び出し側で行う（DB が成功した後）。
// 返すのは、ページを破棄するタブの id と、削除後の今の Workspace の id
export function deleteWorkspaceFlow(
  db: DatabaseSync,
  id: number,
  now = Date.now()
): { tabIds: number[]; currentId: number | null } {
  return inTransaction(db, () => {
    const wasCurrent = getCurrentWorkspaceId(db) === id
    if (!getWorkspace(db, id)) throw new WorkspaceNotFoundError(id)
    const snapshot = buildSnapshot(db, id)
    const tabIds = listTabs(db, id).map((t) => t.id)
    insertSnapshot(db, id, snapshot, now)
    deleteWorkspaceRow(db, id)
    if (wasCurrent) {
      const next = listWorkspaces(db).sort(
        (a, b) => b.lastUsedTimeMs - a.lastUsedTimeMs || a.id - b.id
      )[0]
      if (next) activateWorkspace(db, next.id, now)
    }
    return { tabIds, currentId: getCurrentWorkspaceId(db) }
  })
}

// フルアクティブな Workspace が上限（5 個）を超えていたら、いちばん長く使っていないものを休止にする。
// 開こうとしている Workspace（keepId）は選ばない（ADR-011）。ページの実体の破棄は呼び出し側で行う
function limitActiveWorkspaces(
  db: DatabaseSync,
  keepId: number | readonly number[],
  now: number
): void {
  const active = listWorkspaces(db).filter((w) => w.status === 'active')
  for (const id of workspacesToDormant(active, MAX_ACTIVE_WORKSPACES, keepId)) {
    setWorkspaceDormant(db, id, now)
  }
}
