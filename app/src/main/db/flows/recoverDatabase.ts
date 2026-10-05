import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { migrations as defaultMigrations } from '../migrations'
import { DatabaseCorruptedError } from '../services/errors'
import type { Migration } from '../services/migrate'
import { BACKUP_FILE, DB_FILE, initDatabase } from './initDatabase'

// 壊れた DB を戻したこと（画面で知らせる）。brokenFile は、残した壊れたファイルの名前（保存場所の中）
export type DatabaseRecovery = { kind: 'restored' | 'recreated'; brokenFile: string }

// DB を開く。壊れていたら（data-schema の起動時の手順2、F12）、壊れたファイルを
// trueful.db.broken-<時刻>（-wal・-shm も同じ接尾辞）に移して残し、バックアップから戻す。
// バックアップがない・バックアップも壊れていたら、新しく作る（壊れたバックアップも残す）
export async function openOrRecoverDatabase(
  dir: string,
  migrations: readonly Migration[] = defaultMigrations,
  now: number = Date.now()
): Promise<{ db: DatabaseSync; recovery?: DatabaseRecovery }> {
  try {
    return { db: await initDatabase(dir, migrations) }
  } catch (e) {
    if (!(e instanceof DatabaseCorruptedError)) throw e
  }
  const brokenFile = `${DB_FILE}.broken-${now}`
  moveDatabaseFiles(join(dir, DB_FILE), join(dir, brokenFile))

  const backup = join(dir, BACKUP_FILE)
  if (existsSync(backup)) {
    // 一時ファイルに写してから名前を変える（途中で落ちても、半端な DB を残さない）
    const tmp = join(dir, `${DB_FILE}.restoring`)
    copyFileSync(backup, tmp)
    renameSync(tmp, join(dir, DB_FILE))
    try {
      return { db: await initDatabase(dir, migrations), recovery: { kind: 'restored', brokenFile } }
    } catch (e) {
      if (!(e instanceof DatabaseCorruptedError)) throw e
      // バックアップも壊れていた。写したものは消し、バックアップは残す（新しく作るとき上書きされないように）
      moveDatabaseFiles(join(dir, DB_FILE), undefined)
      renameSync(backup, join(dir, `${BACKUP_FILE}.broken-${now}`))
    }
  }
  return { db: await initDatabase(dir, migrations), recovery: { kind: 'recreated', brokenFile } }
}

// DB と WAL・共有メモリのファイルを、いっしょに移す（to がなければ消す）。
// WAL を残すと、戻した DB に古い変更が書き戻されるため
export function moveDatabaseFiles(from: string, to: string | undefined): void {
  for (const suffix of ['', '-wal', '-shm']) {
    if (!existsSync(from + suffix)) continue
    if (to) renameSync(from + suffix, to + suffix)
    else rmSync(from + suffix, { force: true })
  }
}
