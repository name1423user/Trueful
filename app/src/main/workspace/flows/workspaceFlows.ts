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
// 同じ requestId の依頼がもう一度届いたら（ボタンの二度押し・送り直し）、作らずに最初の結果を返す。
// 作成中の Promise を覚えるので、afterCreate（マニフェストやフォルダの準備。T2-1c）が非同期でも、
// 同時に届いた2回目は同じ結果を待つ。requestId が同じなら、名前や Mode の違いは見ない（ipc-spec.md）
export function createWorkspaceFlow(
  afterCreate: (workspace: Workspace) => Promise<void> = async () => {}
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
      const workspace = inTransaction(db, () => {
        const created = insertWorkspace(db, { name, mode }, now)
        setCurrentWorkspaceId(db, created.id)
        return created
      })
      await afterCreate(workspace)
      return workspace
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
