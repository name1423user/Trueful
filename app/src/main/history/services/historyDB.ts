import type { DatabaseSync } from 'node:sqlite'
import { inTransaction } from '../../db/services/transaction'

// 閲覧履歴（F09。data-schema.md の history_url・history_visit）。SQLite は snake_case、ここから外は camelCase
export type HistoryEntry = {
  id: number
  workspaceId: number
  url: string
  title: string
  visitCount: number
  lastVisitedTimeMs: number
}

const COLUMNS = 'h.id, h.workspace_id, h.url, h.title, h.visit_count, h.last_visited_time_ms'

function toEntry(row: Record<string, unknown>): HistoryEntry {
  return {
    id: Number(row['id']),
    workspaceId: Number(row['workspace_id']),
    url: String(row['url']),
    title: String(row['title']),
    visitCount: Number(row['visit_count']),
    lastVisitedTimeMs: Number(row['last_visited_time_ms'])
  }
}

// 履歴に残す URL からは、フラグメント（#以降）を除く。SPA の画面遷移ごとに行が増えるのを防ぎ、
// OAuth の #access_token= のようなフラグメントのトークンを残さない
export function historyUrl(url: string): string {
  const i = url.indexOf('#')
  return i < 0 ? url : url.slice(0, i)
}

// 履歴に残すのは http・https のページだけ（about:blank やエラーページなどは残さない）
export function isHistoryUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

// 訪問を1回記録する。URL ごとに1行（回数・最後の時刻・最後の題名を更新）、訪問ごとに1行
export function recordVisit(
  db: DatabaseSync,
  input: { workspaceId: number; url: string; title: string; now: number }
): void {
  if (!isHistoryUrl(input.url)) return
  const url = historyUrl(input.url)
  inTransaction(db, () => {
    db.prepare(
      `INSERT INTO history_url (workspace_id, url, title, visit_count, last_visited_time_ms)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT (workspace_id, url) DO UPDATE SET
         visit_count = visit_count + 1,
         last_visited_time_ms = excluded.last_visited_time_ms,
         title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE title END`
    ).run(input.workspaceId, url, input.title, input.now)
    const id = db
      .prepare('SELECT id FROM history_url WHERE workspace_id = ? AND url = ?')
      .get(input.workspaceId, url)?.['id']
    db.prepare('INSERT INTO history_visit (url_id, visited_time_ms) VALUES (?, ?)').run(
      id as number,
      input.now
    )
  })
}

// ページの題名は、読み込みの後に決まる。決まったら、その URL の題名を更新する（空では上書きしない）
export function updateHistoryTitle(
  db: DatabaseSync,
  workspaceId: number,
  url: string,
  title: string
): void {
  if (title === '' || !isHistoryUrl(url)) return
  db.prepare(
    'UPDATE history_url SET title = ? WHERE workspace_id = ? AND url = ? AND title <> ?'
  ).run(title, workspaceId, url, title)
}

// 検索（タイトルと URL の部分一致、新しい順。16ms 以内。data-schema.md「履歴の検索」）。
// 3文字以上: 全文検索（trigram）で、あとから作られた URL から最大 200 件を取り、その中を新しい順に並べる
// （shortcut: 作られた順で切るので、古い URL を最近訪れ直しても、200 件より後ろのヒットなら出ない。困ったら索引に最終訪問を持たせる）。
// 2文字以下: 新しい 5,000 件（Workspace の指定があればその中で）のタイトルと URL を LIKE で見る
const FTS_CANDIDATES = 200
const SHORT_SCAN = 5000

export function searchHistory(
  db: DatabaseSync,
  input: { query: string; workspaceId?: number; exceptWorkspaceId?: number; limit?: number }
): HistoryEntry[] {
  const query = input.query.trim()
  if (query === '') return []
  const limit = input.limit ?? 20
  // workspaceId はその Workspace だけ、exceptWorkspaceId はその Workspace 以外
  const workspace =
    input.workspaceId !== undefined
      ? 'AND h.workspace_id = ?'
      : input.exceptWorkspaceId !== undefined
        ? 'AND h.workspace_id <> ?'
        : ''
  const workspaceArgs = [input.workspaceId ?? input.exceptWorkspaceId].filter(
    (id) => id !== undefined
  )
  if ([...query].length >= 3) {
    // 入力全体を1つの語（フレーズ）として探す。" は "" に直す
    const match = `"${query.replaceAll('"', '""')}"`
    // 候補の 200 件は、Workspace の絞り込みの後に数える（絞り込みで取りこぼさない）。
    // CROSS JOIN は、全文検索の表から先に引かせるため（指定しないと Workspace の索引から引き、337ms かかった）
    return db
      .prepare(
        `SELECT ${COLUMNS} FROM history_url h
         WHERE h.id IN (
           SELECT f.rowid FROM history_url_fts f CROSS JOIN history_url h ON h.id = f.rowid
           WHERE history_url_fts MATCH ? ${workspace} ORDER BY f.rowid DESC LIMIT ${FTS_CANDIDATES})
         ORDER BY h.last_visited_time_ms DESC LIMIT ?`
      )
      .all(match, ...workspaceArgs, limit)
      .map(toEntry)
  }
  const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM (
         SELECT * FROM history_url h ${workspace ? workspace.replace('AND', 'WHERE') : ''}
         ORDER BY last_visited_time_ms DESC LIMIT ${SHORT_SCAN}
       ) h
       WHERE (h.title LIKE ? ESCAPE '\\' OR h.url LIKE ? ESCAPE '\\')
       ORDER BY h.last_visited_time_ms DESC LIMIT ?`
    )
    .all(...workspaceArgs, like, like, limit)
    .map(toEntry)
}

// 訪問の時刻が範囲（両端を含む。省略すると端なし）にあるものを消す。期間を指定しなければ全部。
// 訪問が残る URL は、回数と最後の時刻を数え直す。訪問がなくなった URL の行は消える（全文検索の索引はトリガーで消える）。
// 消した訪問の数を返す
export function deleteHistory(db: DatabaseSync, range: { fromMs?: number; toMs?: number }): number {
  const from = range.fromMs ?? Number.MIN_SAFE_INTEGER
  const to = range.toMs ?? Number.MAX_SAFE_INTEGER
  return inTransaction(db, () => {
    // 消す訪問を持つ URL だけ、残る訪問で回数と最後の時刻を数え直す（全部を数え直さない）
    db.prepare(
      `UPDATE history_url SET
         visit_count = (SELECT count(*) FROM history_visit v
                        WHERE v.url_id = history_url.id AND v.visited_time_ms NOT BETWEEN ?1 AND ?2),
         last_visited_time_ms = COALESCE(
           (SELECT max(visited_time_ms) FROM history_visit v
            WHERE v.url_id = history_url.id AND v.visited_time_ms NOT BETWEEN ?1 AND ?2),
           last_visited_time_ms)
       WHERE id IN (SELECT url_id FROM history_visit WHERE visited_time_ms BETWEEN ?1 AND ?2)`
    ).run(from, to)
    const removed = Number(
      db.prepare('DELETE FROM history_visit WHERE visited_time_ms BETWEEN ? AND ?').run(from, to)
        .changes
    )
    if (removed > 0) db.exec('DELETE FROM history_url WHERE visit_count = 0')
    return removed
  })
}

// 保存期間（日数）を過ぎた訪問を消す（起動時）。ちょうど期間の分は残す。消した訪問の数を返す
export function purgeExpiredHistory(db: DatabaseSync, now: number, days: number): number {
  return deleteHistory(db, { toMs: now - days * 24 * 60 * 60 * 1000 - 1 })
}
