import type { DatabaseSync } from 'node:sqlite'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { parseChromeBookmarks } from '../services/chromeBookmarks'
import { parseHtmlBookmarks } from '../services/htmlBookmarks'
import type { ParsedBookmarks } from '../services/bookmarkTree'
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
  let parsed: ParsedBookmarks
  try {
    // 開いてから大きさを確かめ、同じファイルから読む（確かめた後に差し替えられても、上限を超えて読まない）
    const fd = openSync(path, 'r')
    try {
      const stat = fstatSync(fd)
      const size = stat.size
      if (!stat.isFile() || size > maxBytes) return { status: 'unreadable' }
      const buffer = Buffer.alloc(size)
      readSync(fd, buffer, 0, size, 0)
      const text = buffer.toString('utf8')
      parsed = kind === 'chrome' ? parseChromeBookmarks(text) : parseHtmlBookmarks(text)
    } finally {
      closeSync(fd)
    }
  } catch {
    // 読めない・ブックマークのファイルではない
    return { status: 'unreadable' }
  }
  // DB の失敗は「読めない」ではないので、握りつぶさずに伝える
  const { imported, failed } = importBookmarks(db, parsed, now)
  return { status: 'imported', imported, failed }
}
