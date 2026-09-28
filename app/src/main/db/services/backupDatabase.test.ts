import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupDatabase } from './backupDatabase'
import { DatabaseBackupError } from './errors'
import { openDatabase } from './openDatabase'

describe('backupDatabase', () => {
  let dir: string
  let db: DatabaseSync
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trueful-backup-'))
    db = openDatabase(join(dir, 'trueful.db'))
    db.exec("CREATE TABLE t (v TEXT) STRICT; INSERT INTO t VALUES ('hello')")
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const readBackup = (path: string): unknown => {
    const bak = new DatabaseSync(path, { readOnly: true })
    try {
      return bak.prepare('SELECT v FROM t').get()?.['v']
    } finally {
      bak.close()
    }
  }

  it('DB 全体を .bak に写し、一時ファイルを残さない', async () => {
    const bak = join(dir, 'trueful.db.bak')
    await backupDatabase(db, bak)
    expect(readBackup(bak)).toBe('hello')
    expect(existsSync(`${bak}.tmp`)).toBe(false)
  })

  it('1世代だけ残す（前のバックアップを新しい中身で置き換える）', async () => {
    const bak = join(dir, 'trueful.db.bak')
    await backupDatabase(db, bak)
    db.exec("UPDATE t SET v = 'world'")
    await backupDatabase(db, bak)
    expect(readBackup(bak)).toBe('world')
  })

  it('前回の失敗で残った一時ファイルがあっても、正しく写す', async () => {
    const bak = join(dir, 'trueful.db.bak')
    writeFileSync(`${bak}.tmp`, 'garbage from a crashed backup')
    await backupDatabase(db, bak)
    expect(readBackup(bak)).toBe('hello')
  })

  it('写せなかったときは DatabaseBackupError にし、前のバックアップと一時ファイルを残さない', async () => {
    const bak = join(dir, 'missing-dir', 'trueful.db.bak')
    await expect(backupDatabase(db, bak)).rejects.toBeInstanceOf(DatabaseBackupError)
    expect(existsSync(`${bak}.tmp`)).toBe(false)
  })
})
