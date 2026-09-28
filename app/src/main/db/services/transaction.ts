import type { DatabaseSync } from 'node:sqlite'

// 1つのトランザクションで実行する（途中で失敗したら何も残さない）
export function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (e) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw e
  }
}
