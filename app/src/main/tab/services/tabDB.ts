import type { DatabaseSync } from 'node:sqlite'

// tab テーブルの読み書き（data-schema.md）。SQLite は snake_case、ここから外は camelCase。
// 選択中のタブは列に持たず、last_active_time_ms が最大のタブとする（data-schema.md の設計の判断）
export type Tab = {
  id: number
  workspaceId: number
  url: string
  title: string
  position: number
  scrollY: number
  lastActiveTimeMs: number
}

// 新しいタブ（空のタブ）の URL
export const NEW_TAB_URL = 'about:blank'

const COLUMNS = 'id, workspace_id, url, title, position, scroll_y, last_active_time_ms'

function toTab(row: Record<string, unknown>): Tab {
  return {
    id: Number(row['id']),
    workspaceId: Number(row['workspace_id']),
    url: String(row['url']),
    title: String(row['title']),
    position: Number(row['position']),
    scrollY: Number(row['scroll_y']),
    lastActiveTimeMs: Number(row['last_active_time_ms'])
  }
}

// タブ列の並び順
export function listTabs(db: DatabaseSync, workspaceId: number): Tab[] {
  return db
    .prepare(`SELECT ${COLUMNS} FROM tab WHERE workspace_id = ? ORDER BY position, id`)
    .all(workspaceId)
    .map(toTab)
}

export function getTab(db: DatabaseSync, id: number): Tab | undefined {
  const row = db.prepare(`SELECT ${COLUMNS} FROM tab WHERE id = ?`).get(id)
  return row ? toTab(row) : undefined
}

// 選択中のタブ（最後に選んだタブ）。タブがなければ undefined
export function getActiveTab(db: DatabaseSync, workspaceId: number): Tab | undefined {
  const row = db
    .prepare(
      `SELECT ${COLUMNS} FROM tab WHERE workspace_id = ?
       ORDER BY last_active_time_ms DESC, id DESC LIMIT 1`
    )
    .get(workspaceId)
  return row ? toTab(row) : undefined
}

// タブを足す。position を省くと一番右、指定するとその位置に入れて、右のタブを1つずつずらす。
// 足したタブを選択中にする（last_active_time_ms = now）
export function insertTab(
  db: DatabaseSync,
  input: { workspaceId: number; url: string; title?: string; position?: number },
  now: number
): Tab {
  const { workspaceId, url, title = '', position } = input
  if (position !== undefined) {
    db.prepare(
      'UPDATE tab SET position = position + 1 WHERE workspace_id = ? AND position >= ?'
    ).run(workspaceId, position)
  }
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO tab (workspace_id, url, title, position, last_active_time_ms)
       VALUES (?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(position) + 1, 0) FROM tab WHERE workspace_id = ?)), ?)`
    )
    .run(workspaceId, url, title, position ?? null, workspaceId, now)
  return getTab(db, Number(lastInsertRowid))!
}

// 並び順を 0, 1, 2, … に振り直す（閉じた後の隙間をなくす。position が「左から何番目か」になる）
export function compactPositions(db: DatabaseSync, workspaceId: number): void {
  const update = db.prepare('UPDATE tab SET position = ? WHERE id = ?')
  listTabs(db, workspaceId).forEach((tab, index) => {
    if (tab.position !== index) update.run(index, tab.id)
  })
}

// その Workspace で一番新しい「最後に選んだ時刻」。タブがなければ undefined
export function latestActiveTime(db: DatabaseSync, workspaceId: number): number | undefined {
  const v = db
    .prepare('SELECT MAX(last_active_time_ms) v FROM tab WHERE workspace_id = ?')
    .get(workspaceId)?.['v']
  return v === null || v === undefined ? undefined : Number(v)
}

// ページの URL とタイトルを記録する（ページが移動したとき）
export function updateTabPage(
  db: DatabaseSync,
  id: number,
  page: { url: string; title: string }
): void {
  db.prepare('UPDATE tab SET url = ?, title = ? WHERE id = ?').run(page.url, page.title, id)
}

// ページのスクロール位置を記録する（休止の前。復帰したら戻して 0 にする。F01）
export function updateTabScroll(db: DatabaseSync, id: number, scrollY: number): void {
  db.prepare('UPDATE tab SET scroll_y = ? WHERE id = ?').run(scrollY, id)
}

export function deleteTab(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM tab WHERE id = ?').run(id).changes === 1
}

// 選択する（最後に選んだ時刻を更新する）
export function touchTab(db: DatabaseSync, id: number, now: number): boolean {
  return (
    db.prepare('UPDATE tab SET last_active_time_ms = ? WHERE id = ?').run(now, id).changes === 1
  )
}
