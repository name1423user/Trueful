import type { DatabaseSync } from 'node:sqlite'
import { inTransaction } from '../../db/services/transaction'
import { insertTab, NEW_TAB_URL } from '../../tab/services/tabDB'
import {
  getWorkspace,
  insertWorkspace,
  setCurrentWorkspaceId,
  skipWorkspaceId,
  touchWorkspace,
  type Workspace,
  type WorkspaceMode
} from '../services/workspaceDB'

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

// Workspace を切り替える。最後に使った時刻を更新し、次の起動で開くものとして記録する
export function switchWorkspace(db: DatabaseSync, id: number, now = Date.now()): Workspace {
  return inTransaction(db, () => {
    if (!touchWorkspace(db, id, now)) throw new WorkspaceNotFoundError(id)
    setCurrentWorkspaceId(db, id)
    return getWorkspace(db, id)!
  })
}
