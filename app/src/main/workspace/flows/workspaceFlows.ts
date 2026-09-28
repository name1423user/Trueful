import type { DatabaseSync } from 'node:sqlite'
import {
  getWorkspace,
  insertWorkspace,
  setCurrentWorkspaceId,
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

// Workspace を作り、そのまま開く（F01）。
// 同じ requestId の依頼がもう一度届いたら（ボタンの二度押し・送り直し）、作らずに最初の結果を返す
export function createWorkspaceFlow(): (
  db: DatabaseSync,
  input: { name: string; mode: WorkspaceMode; requestId: string },
  now?: number
) => Workspace {
  const done = new Map<string, number>()
  return (db, { name, mode, requestId }, now = Date.now()) => {
    const earlier = done.get(requestId)
    if (earlier !== undefined) {
      const existing = getWorkspace(db, earlier)
      if (existing) return existing
    }
    const workspace = inTransaction(db, () => {
      const created = insertWorkspace(db, { name, mode }, now)
      setCurrentWorkspaceId(db, created.id)
      return created
    })
    done.set(requestId, workspace.id)
    // 覚えておく依頼の数を限る（二度押しを防げれば足りる）
    if (done.size > 100) done.delete(done.keys().next().value!)
    return workspace
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
