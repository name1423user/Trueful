import type { DatabaseSync } from 'node:sqlite'
import { inTransaction } from '../../db/services/transaction'
import { insertBookmark } from '../services/bookmarkDB'
import type { ImportNode, ParsedBookmarks } from '../services/bookmarkTree'

// 取り込みの結果（F08）。imported は取り込んだブックマークの数（フォルダは数えない）、
// failed は、読み取りのときに取り込めなかった数
export type ImportResult = { imported: number; failed: number }

// 読み取った木を、フォルダ構造ごと、今あるブックマークの後ろに足す（1 トランザクション。途中で失敗したら1件も入れない）
export function importBookmarks(
  db: DatabaseSync,
  parsed: ParsedBookmarks,
  now: number
): ImportResult {
  let imported = 0
  const add = (nodes: ImportNode[], parentId: number | null): void => {
    for (const node of nodes) {
      if (node.kind === 'folder') {
        const folder = insertBookmark(db, { kind: 'folder', title: node.title, parentId }, now)
        add(node.children, folder.id)
      } else {
        insertBookmark(db, { kind: 'url', title: node.title, url: node.url, parentId }, now)
        imported++
      }
    }
  }
  inTransaction(db, () => add(parsed.nodes, null))
  return { imported, failed: parsed.failed }
}
