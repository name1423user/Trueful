import type { DatabaseSync } from 'node:sqlite'
import { listTabs } from '../../tab/services/tabDB'
import { getWorkspace } from './workspaceDB'

// 削除前の自動スナップショット（F01）。名前・Mode・タブの URL とタイトルだけ（るりあの決定、2026-09-29）。
// Cookie・ストレージは入れない。戻す画面は MVP の範囲外
export type WorkspaceSnapshot = {
  name: string
  mode: string
  tabs: { url: string; title: string }[]
}

// 30 日で消す（Archive の境界に合わせる。data-schema.md）
export const SNAPSHOT_KEEP_MS = 30 * 24 * 60 * 60 * 1000

export function buildSnapshot(db: DatabaseSync, workspaceId: number): WorkspaceSnapshot {
  const w = getWorkspace(db, workspaceId)
  if (!w) throw new Error(`Workspace ${workspaceId} がない`)
  return {
    name: w.name,
    mode: w.mode,
    tabs: listTabs(db, workspaceId).map(({ url, title }) => ({ url, title }))
  }
}

export function insertSnapshot(
  db: DatabaseSync,
  workspaceId: number,
  snapshot: WorkspaceSnapshot,
  now: number
): void {
  db.prepare(
    'INSERT INTO workspace_snapshot (workspace_id, snapshot_json, created_time_ms) VALUES (?, ?, ?)'
  ).run(workspaceId, JSON.stringify(snapshot), now)
}

// 期限を過ぎたものを消す。消した数を返す
export function purgeExpiredSnapshots(db: DatabaseSync, now: number): number {
  const result = db
    .prepare('DELETE FROM workspace_snapshot WHERE created_time_ms <= ?')
    .run(now - SNAPSHOT_KEEP_MS)
  return Number(result.changes)
}
