import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { migrations as defaultMigrations } from '../migrations'
import { backupDatabase } from '../services/backupDatabase'
import { checkIntegrity } from '../services/checkIntegrity'
import { DatabaseCorruptedError, isCorruptionError } from '../services/errors'
import { migrate, type Migration } from '../services/migrate'
import { openDatabase } from '../services/openDatabase'

export const DB_FILE = 'trueful.db'
export const BACKUP_FILE = 'trueful.db.bak'

// 起動時の手順（data-schema.md の「起動時の手順とバックアップ」）:
// 開く → 壊れていないか確かめる → バックアップ → マイグレーション。
// 壊れた DB で正しいバックアップを上書きしないよう、確かめてからバックアップする。
// 壊れていたときの復元は F12 で行う
export async function initDatabase(
  dir: string,
  migrations: readonly Migration[] = defaultMigrations
): Promise<DatabaseSync> {
  const path = join(dir, DB_FILE)
  let db: DatabaseSync | undefined
  try {
    db = openDatabase(path)
    if (!checkIntegrity(db)) throw new DatabaseCorruptedError(path)
    await backupDatabase(db, join(dir, BACKUP_FILE))
    migrate(db, migrations)
    return db
  } catch (e) {
    db?.close()
    // 壊れ方によっては、quick_check の結果ではなく、開くときや確かめるときの例外として出る
    if (isCorruptionError(e)) throw new DatabaseCorruptedError(path, { cause: e })
    throw e
  }
}
