import { DatabaseSync } from 'node:sqlite'

// DB を開き、接続ごとの設定をする（data-schema.md の「共通の約束」）
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `)
  return db
}
