import type { DatabaseSync } from 'node:sqlite'

// ダウンロードの記録（F07。data-schema.md の download）。行を消しても、保存したファイルは消さない。
// SQLite は snake_case、ここから外は camelCase
export type DownloadState = 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'interrupted'

export type Download = {
  id: number
  workspaceId: number
  url: string
  path: string
  state: DownloadState
  receivedBytes: number
  totalBytes: number | null
  startedTimeMs: number
  endedTimeMs: number | null
}

const COLUMNS =
  'id, workspace_id, url, path, state, received_bytes, total_bytes, started_time_ms, ended_time_ms'

function toDownload(row: Record<string, unknown>): Download {
  return {
    id: Number(row['id']),
    workspaceId: Number(row['workspace_id']),
    url: String(row['url']),
    path: String(row['path']),
    state: row['state'] as DownloadState,
    receivedBytes: Number(row['received_bytes']),
    totalBytes: row['total_bytes'] === null ? null : Number(row['total_bytes']),
    startedTimeMs: Number(row['started_time_ms']),
    endedTimeMs: row['ended_time_ms'] === null ? null : Number(row['ended_time_ms'])
  }
}

// 始める（in_progress で記録）。大きさが分からないときは totalBytes が null
export function insertDownload(
  db: DatabaseSync,
  input: { workspaceId: number; url: string; path: string; totalBytes: number | null },
  now: number
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO download (workspace_id, url, path, state, total_bytes, started_time_ms)
         VALUES (?, ?, ?, 'in_progress', ?, ?)`
      )
      .run(input.workspaceId, input.url, input.path, input.totalBytes, now).lastInsertRowid
  )
}

// 進み具合・状態を更新する（渡した項目だけ）
export function updateDownload(
  db: DatabaseSync,
  id: number,
  patch: { receivedBytes?: number; totalBytes?: number | null; state?: DownloadState }
): void {
  db.prepare(
    `UPDATE download SET
       received_bytes = COALESCE(?, received_bytes),
       total_bytes = CASE WHEN ? THEN ? ELSE total_bytes END,
       state = COALESCE(?, state)
     WHERE id = ?`
  ).run(
    patch.receivedBytes ?? null,
    'totalBytes' in patch ? 1 : 0,
    patch.totalBytes ?? null,
    patch.state ?? null,
    id
  )
}

// 終わった（完了・取り消し・中断）。状態と終了時刻を書く
export function finishDownload(
  db: DatabaseSync,
  id: number,
  state: 'completed' | 'cancelled' | 'interrupted',
  now: number
): void {
  db.prepare('UPDATE download SET state = ?, ended_time_ms = ? WHERE id = ?').run(state, now, id)
}

// 新しい順。Workspace を指定するとその Workspace の分だけ
export function listDownloads(db: DatabaseSync, workspaceId?: number): Download[] {
  const where = workspaceId === undefined ? '' : 'WHERE workspace_id = ?'
  return db
    .prepare(`SELECT ${COLUMNS} FROM download ${where} ORDER BY started_time_ms DESC, id DESC`)
    .all(...(workspaceId === undefined ? [] : [workspaceId]))
    .map(toDownload)
}

// 起動時に、終わっていない（in_progress・paused）ものを interrupted にする。
// 再開は起動している間だけ（data-schema.md。再起動をまたぐ情報は持たない）。直した数を返す
export function interruptUnfinishedDownloads(db: DatabaseSync, now: number): number {
  return Number(
    db
      .prepare(
        `UPDATE download SET state = 'interrupted', ended_time_ms = ?
         WHERE state IN ('in_progress', 'paused')`
      )
      .run(now).changes
  )
}
