import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseCorruptedError } from '../services/errors'
import type { Migration } from '../services/migrate'
import { BACKUP_FILE, DB_FILE, initDatabase } from './initDatabase'

const createTable: Migration = {
  version: 1,
  up: (db) => db.exec('CREATE TABLE item (id INTEGER PRIMARY KEY, v TEXT) STRICT')
}

describe('initDatabase', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trueful-init-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('空の保存場所に DB とバックアップを作り、マイグレーションを適用して、設定済みの接続を返す', async () => {
    const db = await initDatabase(dir, [createTable])
    try {
      expect(db.prepare('PRAGMA user_version').get()?.['user_version']).toBe(1)
      expect(db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys']).toBe(1)
      expect(db.prepare('PRAGMA journal_mode').get()?.['journal_mode']).toBe('wal')
      expect(existsSync(join(dir, BACKUP_FILE))).toBe(true)
    } finally {
      db.close()
    }
  })

  it('バックアップはマイグレーションの前に取る（戻せば前の版に戻れる）', async () => {
    ;(await initDatabase(dir, [])).close()
    ;(await initDatabase(dir, [createTable])).close()
    const bak = new DatabaseSync(join(dir, BACKUP_FILE), { readOnly: true })
    try {
      expect(bak.prepare('PRAGMA user_version').get()?.['user_version']).toBe(0)
    } finally {
      bak.close()
    }
  })

  it('DB が壊れていたら DatabaseCorruptedError にし、正しいバックアップを上書きしない', async () => {
    const db = await initDatabase(dir, [createTable])
    const insert = db.prepare('INSERT INTO item (v) VALUES (?)')
    for (let i = 0; i < 2000; i++) insert.run('x'.repeat(100))
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    db.close()
    ;(await initDatabase(dir, [createTable])).close()
    const goodBackup = readFileSync(join(dir, BACKUP_FILE))

    // 表の中身があるページ（先頭のページより後ろ）を壊す
    const fd = openSync(join(dir, DB_FILE), 'r+')
    writeSync(fd, Buffer.alloc(4096 * 4, 0xab), 0, 4096 * 4, 4096 * 3)
    closeSync(fd)

    await expect(initDatabase(dir, [createTable])).rejects.toBeInstanceOf(DatabaseCorruptedError)
    expect(readFileSync(join(dir, BACKUP_FILE)).equals(goodBackup)).toBe(true)
  })

  it('DB ではないファイルも、壊れた DB として扱う', async () => {
    writeFileSync(join(dir, DB_FILE), 'not a database '.repeat(10))
    await expect(initDatabase(dir, [createTable])).rejects.toBeInstanceOf(DatabaseCorruptedError)
    expect(existsSync(join(dir, BACKUP_FILE))).toBe(false)
  })
})
