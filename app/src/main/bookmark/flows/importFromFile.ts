import type { DatabaseSync } from 'node:sqlite'
import { readFileSync, statSync } from 'node:fs'
import { parseChromeBookmarks } from '../services/chromeBookmarks'
import { parseHtmlBookmarks } from '../services/htmlBookmarks'
import { importBookmarks } from './importBookmarks'

// 取り込むファイルの大きさの上限（Chrome の Bookmarks は、数千件でも数 MB）
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024

// imported: 取り込んだ（件数つき）、unreadable: 読めない・大きすぎる・ブックマークのファイルではない。
// ファイルが見つからない・選ばなかった、は呼び出し側で扱う
export type FileImportResult =
  { status: 'imported'; imported: number; failed: number } | { status: 'unreadable' }

// ファイルを読んで、ブックマークとして取り込む（1 トランザクション。失敗したら1件も入れない）
export function importFromFile(
  db: DatabaseSync,
  path: string,
  kind: 'chrome' | 'html',
  now: number,
  maxBytes = MAX_IMPORT_BYTES
): FileImportResult {
  try {
    const stat = statSync(path)
    if (!stat.isFile() || stat.size > maxBytes) return { status: 'unreadable' }
    const text = readFileSync(path, 'utf8')
    const parsed = kind === 'chrome' ? parseChromeBookmarks(text) : parseHtmlBookmarks(text)
    const { imported, failed } = importBookmarks(db, parsed, now)
    return { status: 'imported', imported, failed }
  } catch {
    return { status: 'unreadable' }
  }
}
