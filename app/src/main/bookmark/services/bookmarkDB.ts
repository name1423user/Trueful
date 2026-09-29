import type { DatabaseSync } from 'node:sqlite'
import { inTransaction } from '../../db/services/transaction'
import { isBookmarkUrl } from './bookmarkTree'

// ブックマーク（F08。data-schema.md の bookmark）。全 Workspace で共有する。
// SQLite は snake_case、ここから外は camelCase。parentId が null なら一番上
export type Bookmark = {
  id: number
  parentId: number | null
  kind: 'folder' | 'url'
  title: string
  url: string | null
  position: number
  createdTimeMs: number
}

const COLUMNS = 'id, parent_id, kind, title, url, position, created_time_ms'

function toBookmark(row: Record<string, unknown>): Bookmark {
  return {
    id: Number(row['id']),
    parentId: row['parent_id'] === null ? null : Number(row['parent_id']),
    kind: row['kind'] as Bookmark['kind'],
    title: String(row['title']),
    url: row['url'] === null ? null : String(row['url']),
    position: Number(row['position']),
    createdTimeMs: Number(row['created_time_ms'])
  }
}

// 全部（親ごと・順番どおり）。左パネルで木にするのは画面の側
export function listBookmarks(db: DatabaseSync): Bookmark[] {
  return db
    .prepare(`SELECT ${COLUMNS} FROM bookmark ORDER BY parent_id IS NOT NULL, parent_id, position`)
    .all()
    .map(toBookmark)
}

function nextPosition(db: DatabaseSync, parentId: number | null): number {
  const max = db
    .prepare('SELECT max(position) m FROM bookmark WHERE parent_id IS ?')
    .get(parentId)?.['m']
  return max === null || max === undefined ? 0 : Number(max) + 1
}

// 追加する。同じフォルダの一番下に入る。URL は http・https だけ（フォルダには URL を付けない）
export function insertBookmark(
  db: DatabaseSync,
  input: { kind: 'folder' | 'url'; title: string; url?: string; parentId?: number | null },
  now: number
): Bookmark {
  if (input.kind === 'url' && !(input.url !== undefined && isBookmarkUrl(input.url))) {
    throw new Error('ブックマークの URL は http・https だけ')
  }
  const parentId = input.parentId ?? null
  const url = input.kind === 'url' ? input.url! : null
  // 取り込み（importBookmarks）のトランザクションの中でも呼ぶので、ここでは開始しない
  const id = Number(
    db
      .prepare(
        'INSERT INTO bookmark (parent_id, kind, title, url, position, created_time_ms) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(parentId, input.kind, input.title, url, nextPosition(db, parentId), now).lastInsertRowid
  )
  return toBookmark(db.prepare(`SELECT ${COLUMNS} FROM bookmark WHERE id = ?`).get(id)!)
}

// タイトルと URL を編集する（種類は変えない）。ない id は false
export function updateBookmark(
  db: DatabaseSync,
  id: number,
  patch: { title?: string; url?: string }
): boolean {
  if (patch.url !== undefined && !isBookmarkUrl(patch.url)) {
    throw new Error('ブックマークの URL は http・https だけ')
  }
  const current = db.prepare('SELECT kind FROM bookmark WHERE id = ?').get(id)
  if (!current) return false
  if (patch.url !== undefined && current['kind'] !== 'url')
    throw new Error('フォルダに URL は付けられない')
  db.prepare(
    'UPDATE bookmark SET title = COALESCE(?, title), url = COALESCE(?, url) WHERE id = ?'
  ).run(patch.title ?? null, patch.url ?? null, id)
  return true
}

// 消す（フォルダなら中身もいっしょに）。ない id は false
export function deleteBookmark(db: DatabaseSync, id: number): boolean {
  return Number(db.prepare('DELETE FROM bookmark WHERE id = ?').run(id).changes) > 0
}

// 別のフォルダ（null なら一番上）の一番下へ移す。自分自身・自分の中のフォルダへは移せない（循環）。
// 元のフォルダの順番は詰める
export function moveBookmark(db: DatabaseSync, id: number, parentId: number | null): void {
  inTransaction(db, () => {
    const from = db.prepare('SELECT parent_id FROM bookmark WHERE id = ?').get(id)
    if (!from) throw new Error(`ブックマーク ${id} がない`)
    if (parentId !== null) {
      const cycle = db
        .prepare(
          `WITH RECURSIVE sub(id) AS (
             SELECT ? UNION SELECT b.id FROM bookmark b JOIN sub ON b.parent_id = sub.id)
           SELECT 1 FROM sub WHERE id = ?`
        )
        .get(id, parentId)
      if (cycle) throw new Error('自分の中へは移せない')
    }
    db.prepare('UPDATE bookmark SET parent_id = ?, position = ? WHERE id = ?').run(
      parentId,
      nextPosition(db, parentId),
      id
    )
    const rows = db
      .prepare('SELECT id FROM bookmark WHERE parent_id IS ? ORDER BY position')
      .all(from['parent_id'])
    rows.forEach((r, i) =>
      db.prepare('UPDATE bookmark SET position = ? WHERE id = ?').run(i, Number(r['id']))
    )
  })
}

// 統合検索欄の候補（F10）。URL のブックマークだけを、タイトルと URL の部分一致で探す
export function searchBookmarks(db: DatabaseSync, query: string, limit = 20): Bookmark[] {
  const q = query.trim()
  if (q === '') return []
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM bookmark
       WHERE kind = 'url' AND (title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')
       ORDER BY created_time_ms DESC LIMIT ?`
    )
    .all(like, like, limit)
    .map(toBookmark)
}
