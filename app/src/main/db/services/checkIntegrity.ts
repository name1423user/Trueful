import type { DatabaseSync } from 'node:sqlite'

// DB が壊れていないか（PRAGMA quick_check が 'ok' を1行だけ返すか）
export function checkIntegrity(db: DatabaseSync): boolean {
  const rows = db.prepare('PRAGMA quick_check').all()
  return rows.length === 1 && rows[0]['quick_check'] === 'ok'
}
