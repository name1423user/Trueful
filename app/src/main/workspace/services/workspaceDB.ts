import type { DatabaseSync } from 'node:sqlite'

// workspace テーブルの読み書き（data-schema.md）。SQLite は snake_case、ここから外は camelCase
export const WORKSPACE_MODES = ['production', 'development', 'testing', 'custom'] as const
export type WorkspaceMode = (typeof WORKSPACE_MODES)[number]

export type Workspace = {
  id: number
  name: string
  mode: WorkspaceMode
  status: 'active' | 'dormant'
  position: number
  lastUsedTimeMs: number
  dormantedTimeMs: number | null
  createdTimeMs: number
}

const COLUMNS =
  'id, name, mode, status, position, last_used_time_ms, dormanted_time_ms, created_time_ms'

function toWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: Number(row['id']),
    name: String(row['name']),
    mode: row['mode'] as WorkspaceMode,
    status: row['status'] as Workspace['status'],
    position: Number(row['position']),
    lastUsedTimeMs: Number(row['last_used_time_ms']),
    dormantedTimeMs: row['dormanted_time_ms'] === null ? null : Number(row['dormanted_time_ms']),
    createdTimeMs: Number(row['created_time_ms'])
  }
}

// 左パネルの並び順
export function listWorkspaces(db: DatabaseSync): Workspace[] {
  return db.prepare(`SELECT ${COLUMNS} FROM workspace ORDER BY position, id`).all().map(toWorkspace)
}

export function getWorkspace(db: DatabaseSync, id: number): Workspace | undefined {
  const row = db.prepare(`SELECT ${COLUMNS} FROM workspace WHERE id = ?`).get(id)
  return row ? toWorkspace(row) : undefined
}

// 一番下に足す。最後に使った時刻は作った時刻（ADR-012）
export function insertWorkspace(
  db: DatabaseSync,
  input: { name: string; mode: WorkspaceMode },
  now: number
): Workspace {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO workspace (name, mode, position, last_used_time_ms, created_time_ms)
       VALUES (?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM workspace), ?, ?)`
    )
    .run(input.name, input.mode, now, now)
  return getWorkspace(db, Number(lastInsertRowid))!
}

export function touchWorkspace(db: DatabaseSync, id: number, now: number): boolean {
  return (
    db.prepare('UPDATE workspace SET last_used_time_ms = ? WHERE id = ?').run(now, id).changes === 1
  )
}

export function getCurrentWorkspaceId(db: DatabaseSync): number | null {
  const v = db.prepare('SELECT last_workspace_id v FROM app_state WHERE id = 1').get()?.['v']
  return v === null || v === undefined ? null : Number(v)
}

export function setCurrentWorkspaceId(db: DatabaseSync, id: number | null): void {
  db.prepare('UPDATE app_state SET last_workspace_id = ? WHERE id = 1').run(id)
}
