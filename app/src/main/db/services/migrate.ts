import type { DatabaseSync } from 'node:sqlite'
import { DatabaseTooNewError, MigrationError } from './errors'

export type Migration = {
  version: number
  up: (db: DatabaseSync) => void
}

export function getVersion(db: DatabaseSync): number {
  return Number(db.prepare('PRAGMA user_version').get()?.['user_version'] ?? 0)
}

// user_version より新しいマイグレーションを、番号順に1つずつ適用する（data-schema.md の「マイグレーション」）。
// 1つのマイグレーションは1つのトランザクションで、失敗したらその版の変更をすべて取り消す。
// 表を作り直す種類のマイグレーション（トランザクションの外で foreign_keys を OFF にする）には、まだ対応していない。
// 初めて必要になったときに、Migration に印を足して対応する
export function migrate(db: DatabaseSync, migrations: readonly Migration[]): number {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`マイグレーションの番号が連続していない: ${m.version}`)
  })
  const appVersion = migrations.length
  const current = getVersion(db)
  if (current > appVersion) throw new DatabaseTooNewError(current, appVersion)

  for (const m of migrations.slice(current)) {
    db.exec('BEGIN IMMEDIATE')
    try {
      m.up(db)
      // up() の中でトランザクションが終わっていたら、版を上げずに失敗にする
      if (!db.isTransaction)
        throw new Error('マイグレーションの中でトランザクションを終えてはいけない')
      db.exec(`PRAGMA user_version = ${m.version}`)
      db.exec('COMMIT')
    } catch (e) {
      // SQLite が自分で取り消していることもある。ROLLBACK の失敗で元のエラーを隠さない
      try {
        if (db.isTransaction) db.exec('ROLLBACK')
      } catch {
        // 元のエラー（e）を優先する
      }
      throw new MigrationError(m.version, { cause: e })
    }
  }
  return appVersion
}
