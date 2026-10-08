import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { migrations as defaultMigrations } from '../migrations'
import { DatabaseCorruptedError } from '../services/errors'
import type { Migration } from '../services/migrate'
import { BACKUP_FILE, DB_FILE, initDatabase } from './initDatabase'

// 壊れた DB を戻したこと（画面で知らせる）。brokenFile は、残した壊れたファイルの名前（保存場所の中）。
// 動かしたファイルがなければ（DB がなかった）、ない
export type DatabaseRecovery = { kind: 'restored' | 'recreated'; brokenFile?: string }

const RESTORING = `${DB_FILE}.restoring`

// DB を開く。壊れていたら（data-schema の起動時の手順2、F12）、壊れたファイルを
// trueful.db.broken-<時刻>（-wal・-shm も同じ接尾辞）に移して残し、バックアップから戻す。
// バックアップがない・バックアップも壊れていたら、新しく作る（壊れたバックアップも残す）。
// 前回の復元が途中で止まって DB がないときも、新しく作らずにバックアップから戻す
// （新しく作ると、起動時のバックアップが、ただ1つの正しいバックアップを空の DB で上書きするため）
export async function openOrRecoverDatabase(
  dir: string,
  migrations: readonly Migration[] = defaultMigrations,
  now: number = Date.now()
): Promise<{ db: DatabaseSync; recovery?: DatabaseRecovery }> {
  const dbPath = join(dir, DB_FILE)
  const backup = join(dir, BACKUP_FILE)
  // 前回の復元の途中で残った一時ファイル
  rmSync(join(dir, RESTORING), { force: true })
  const broken = freeName(dir, `${DB_FILE}.broken-${now}`)
  // DB がないのに WAL・共有メモリだけ残っているときは、脇へよける（新しい DB に古い変更が書き戻されないように）
  let moved = !existsSync(dbPath) && moveDatabaseFiles(dbPath, join(dir, broken))
  if (existsSync(dbPath) || !existsSync(backup)) {
    try {
      return { db: await initDatabase(dir, migrations) }
    } catch (e) {
      if (!(e instanceof DatabaseCorruptedError)) throw e
    }
  }
  if (existsSync(backup)) {
    // 先に写してから、壊れたものをよける（どこで止まっても、正しいバックアップと DB のどちらかが残る）
    const tmp = join(dir, RESTORING)
    copyFileSync(backup, tmp)
    moved = moveDatabaseFiles(dbPath, join(dir, broken)) || moved
    renameSync(tmp, dbPath)
    const brokenFile = moved ? broken : undefined
    try {
      return { db: await initDatabase(dir, migrations), recovery: { kind: 'restored', brokenFile } }
    } catch (e) {
      if (!(e instanceof DatabaseCorruptedError)) {
        console.error('[db] バックアップから戻した後に開けなかった', { brokenFile: broken }, e)
        throw e
      }
      // バックアップも壊れていた。写したものは消し、バックアップは残す（新しく作るとき上書きされないように）
      moveDatabaseFiles(dbPath, undefined)
      renameSync(backup, join(dir, freeName(dir, `${BACKUP_FILE}.broken-${now}`)))
    }
  } else {
    moved = moveDatabaseFiles(dbPath, join(dir, broken)) || moved
  }
  return {
    db: await initDatabase(dir, migrations),
    recovery: { kind: 'recreated', brokenFile: moved ? broken : undefined }
  }
}

// DB と WAL・共有メモリのファイルを、いっしょに移す（to がなければ消す）。1つでも動かしたら true。
// WAL を残すと、戻した DB に古い変更が書き戻されるため
export function moveDatabaseFiles(from: string, to: string | undefined): boolean {
  let moved = false
  for (const suffix of ['', '-wal', '-shm']) {
    if (!existsSync(from + suffix)) continue
    if (to) renameSync(from + suffix, to + suffix)
    else rmSync(from + suffix, { force: true })
    moved = true
  }
  return moved
}

// 前に残した壊れたファイルを上書きしないよう、使われていない名前にする（-1、-2 と足す）
function freeName(dir: string, name: string): string {
  const used = (n: string): boolean =>
    ['', '-wal', '-shm'].some((suffix) => existsSync(join(dir, n + suffix)))
  let candidate = name
  for (let i = 1; used(candidate); i++) candidate = `${name}-${i}`
  return candidate
}
