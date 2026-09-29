import type { DatabaseSync } from 'node:sqlite'
import type { Permission } from './permissionMap'

// サイトの権限の記憶（F16。data-schema.md の site_permission）。Workspace とサイトと権限の組ごとに1行。
// SQLite は snake_case、ここから外は camelCase
export type Decision = 'allow' | 'deny'

export type SitePermission = {
  workspaceId: number
  origin: string
  permission: Permission
  decision: Decision
  decidedTimeMs: number
}

// 決めていなければ undefined
export function getDecision(
  db: DatabaseSync,
  workspaceId: number,
  origin: string,
  permission: Permission
): Decision | undefined {
  const row = db
    .prepare(
      'SELECT decision FROM site_permission WHERE workspace_id = ? AND origin = ? AND permission = ?'
    )
    .get(workspaceId, origin, permission)
  return row ? (row['decision'] as Decision) : undefined
}

// 決める（決め直したら上書き）
export function setDecision(
  db: DatabaseSync,
  workspaceId: number,
  origin: string,
  permission: Permission,
  decision: Decision,
  now: number
): void {
  db.prepare(
    `INSERT INTO site_permission (workspace_id, origin, permission, decision, decided_time_ms)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (workspace_id, origin, permission)
     DO UPDATE SET decision = excluded.decision, decided_time_ms = excluded.decided_time_ms`
  ).run(workspaceId, origin, permission, decision, now)
}

// 取り消す（また未決になり、次に要求されたら確認する）。なければ false
export function revokePermission(
  db: DatabaseSync,
  workspaceId: number,
  origin: string,
  permission: Permission
): boolean {
  return (
    Number(
      db
        .prepare(
          'DELETE FROM site_permission WHERE workspace_id = ? AND origin = ? AND permission = ?'
        )
        .run(workspaceId, origin, permission).changes
    ) > 0
  )
}

// 一覧（サイト・権限の順）。Workspace で絞れる
export function listPermissions(db: DatabaseSync, workspaceId?: number): SitePermission[] {
  const where = workspaceId === undefined ? '' : 'WHERE workspace_id = ?'
  return db
    .prepare(
      `SELECT workspace_id, origin, permission, decision, decided_time_ms
       FROM site_permission ${where} ORDER BY workspace_id, origin, permission`
    )
    .all(...(workspaceId === undefined ? [] : [workspaceId]))
    .map((row) => ({
      workspaceId: Number(row['workspace_id']),
      origin: String(row['origin']),
      permission: row['permission'] as Permission,
      decision: row['decision'] as Decision,
      decidedTimeMs: Number(row['decided_time_ms'])
    }))
}
