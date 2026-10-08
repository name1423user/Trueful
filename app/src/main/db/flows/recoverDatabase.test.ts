import {
  closeSync,
  mkdirSync,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  rmSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Migration } from '../services/migrate'
import { BACKUP_FILE, DB_FILE, initDatabase } from './initDatabase'
import { moveDatabaseFiles, openOrRecoverDatabase } from './recoverDatabase'

const createTable: Migration = {
  version: 1,
  up: (db) => db.exec('CREATE TABLE item (id INTEGER PRIMARY KEY, v TEXT) STRICT')
}
const NOW = 1_700_000_000_000

// 表の中身があるページ（先頭のページより後ろ）を壊す
function corrupt(path: string): void {
  const fd = openSync(path, 'r+')
  writeSync(fd, Buffer.alloc(4096 * 4, 0xab), 0, 4096 * 4, 4096 * 3)
  closeSync(fd)
}

describe('openOrRecoverDatabase（F12、data-schema の起動時の手順2）', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trueful-recover-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  // 2000 行入れて閉じ、もう一度起動してバックアップを取る（バックアップにも 2000 行ある）
  async function prepare(): Promise<void> {
    const db = await initDatabase(dir, [createTable])
    const insert = db.prepare('INSERT INTO item (v) VALUES (?)')
    for (let i = 0; i < 2000; i++) insert.run('x'.repeat(100))
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    db.close()
    ;(await initDatabase(dir, [createTable])).close()
  }

  it('壊れていなければ、そのまま開く（知らせはない）', async () => {
    await prepare()
    const { db, recovery } = await openOrRecoverDatabase(dir, [createTable], NOW)
    db.close()
    expect(recovery).toBeUndefined()
  })

  it('壊れていたら、壊れたファイルを残して、バックアップから戻す', async () => {
    await prepare()
    corrupt(join(dir, DB_FILE))
    const { db, recovery } = await openOrRecoverDatabase(dir, [createTable], NOW)
    try {
      expect(recovery).toEqual({ kind: 'restored', brokenFile: `${DB_FILE}.broken-${NOW}` })
      expect(db.prepare('SELECT count(*) n FROM item').get()?.['n']).toBe(2000)
    } finally {
      db.close()
    }
    expect(existsSync(join(dir, `${DB_FILE}.broken-${NOW}`))).toBe(true)
    expect(existsSync(join(dir, BACKUP_FILE))).toBe(true)
  })

  it('バックアップがなければ、壊れたファイルを残して、新しく作る', async () => {
    writeFileSync(join(dir, DB_FILE), 'not a database '.repeat(10))
    const { db, recovery } = await openOrRecoverDatabase(dir, [createTable], NOW)
    try {
      expect(recovery).toEqual({ kind: 'recreated', brokenFile: `${DB_FILE}.broken-${NOW}` })
      expect(db.prepare('SELECT count(*) n FROM item').get()?.['n']).toBe(0)
    } finally {
      db.close()
    }
    expect(existsSync(join(dir, `${DB_FILE}.broken-${NOW}`))).toBe(true)
  })

  it('バックアップも壊れていたら、両方を残して、新しく作る', async () => {
    await prepare()
    corrupt(join(dir, DB_FILE))
    corrupt(join(dir, BACKUP_FILE))
    const { db, recovery } = await openOrRecoverDatabase(dir, [createTable], NOW)
    db.close()
    expect(recovery?.kind).toBe('recreated')
    const names = readdirSync(dir)
    expect(names).toContain(`${DB_FILE}.broken-${NOW}`)
    expect(names).toContain(`${BACKUP_FILE}.broken-${NOW}`)
  })

  it('DB と WAL・共有メモリのファイルを、同じ接尾辞でいっしょに移す（WAL を残すと、戻した DB に古い変更が書き戻される）', () => {
    for (const suffix of ['', '-wal', '-shm']) writeFileSync(join(dir, DB_FILE + suffix), 'x')
    expect(moveDatabaseFiles(join(dir, DB_FILE), join(dir, 'moved'))).toBe(true)
    expect(readdirSync(dir).sort()).toEqual(['moved', 'moved-shm', 'moved-wal'])
    expect(moveDatabaseFiles(join(dir, 'moved'), undefined)).toBe(true)
    expect(readdirSync(dir)).toEqual([])
    expect(moveDatabaseFiles(join(dir, 'moved'), undefined)).toBe(false)
  })

  it('前回の復元が途中で止まり DB がないときは、新しく作らずにバックアップから戻す（バックアップを空の DB で上書きしない）', async () => {
    await prepare()
    rmSync(join(dir, DB_FILE))
    writeFileSync(join(dir, `${DB_FILE}.restoring`), 'half')
    writeFileSync(join(dir, `${DB_FILE}-wal`), 'old wal')
    const { db, recovery } = await openOrRecoverDatabase(dir, [createTable], NOW)
    try {
      expect(recovery?.kind).toBe('restored')
      expect(db.prepare('SELECT count(*) n FROM item').get()?.['n']).toBe(2000)
    } finally {
      db.close()
    }
    // 残っていた WAL は、戻した DB に書き戻さないよう脇へよける。一時ファイルは片付ける
    const names = readdirSync(dir)
    expect(names).toContain(`${DB_FILE}.broken-${NOW}-wal`)
    expect(names).not.toContain(`${DB_FILE}.restoring`)
  })

  it('壊れたファイルを残す名前がすでにあれば、番号を足して上書きしない', async () => {
    writeFileSync(join(dir, `${DB_FILE}.broken-${NOW}`), 'earlier')
    writeFileSync(join(dir, DB_FILE), 'not a database '.repeat(10))
    const { db, recovery } = await openOrRecoverDatabase(dir, [createTable], NOW)
    db.close()
    expect(recovery?.brokenFile).toBe(`${DB_FILE}.broken-${NOW}-1`)
    expect(readdirSync(dir)).toContain(`${DB_FILE}.broken-${NOW}`)
  })

  it('バックアップを写せなかったら、壊れた DB も動かさずに失敗する（次の起動でやり直せる）', async () => {
    writeFileSync(join(dir, DB_FILE), 'not a database '.repeat(10))
    mkdirSync(join(dir, BACKUP_FILE)) // 写せないもの（フォルダ）にする
    await expect(openOrRecoverDatabase(dir, [createTable], NOW)).rejects.toThrow()
    expect(existsSync(join(dir, DB_FILE))).toBe(true)
    expect(readdirSync(dir).some((n) => n.includes('.broken-'))).toBe(false)
  })

  it('DB がなくバックアップがあるとき、動かすものがなければ brokenFile はない（ないファイルを残したと言わない）', async () => {
    await prepare()
    rmSync(join(dir, DB_FILE))
    const { db, recovery } = await openOrRecoverDatabase(dir, [createTable], NOW)
    db.close()
    expect(recovery?.kind).toBe('restored')
    expect(recovery?.brokenFile).toBeUndefined()
    expect(readdirSync(dir).some((n) => n.includes('.broken-'))).toBe(false)
  })

  it('DB もバックアップもなく WAL だけ残っているときは、WAL を脇へよけて新しく作る（古い変更を書き戻さない）', async () => {
    writeFileSync(join(dir, `${DB_FILE}-wal`), 'old wal')
    const { db, recovery } = await openOrRecoverDatabase(dir, [createTable], NOW)
    try {
      expect(recovery).toBeUndefined()
      expect(db.prepare('SELECT count(*) n FROM item').get()?.['n']).toBe(0)
    } finally {
      db.close()
    }
    expect(readdirSync(dir)).toContain(`${DB_FILE}.broken-${NOW}-wal`)
  })

  it('DB がなく WAL だけ残り、バックアップがあるときは、WAL を残したと知らせて戻す', async () => {
    await prepare()
    rmSync(join(dir, DB_FILE))
    writeFileSync(join(dir, `${DB_FILE}-wal`), 'old wal')
    const { db, recovery } = await openOrRecoverDatabase(dir, [createTable], NOW)
    db.close()
    expect(recovery).toEqual({ kind: 'restored', brokenFile: `${DB_FILE}.broken-${NOW}` })
  })

  it('DB がなくバックアップも壊れていたら、ファイル名なしで「新しく作った」と知らせる', async () => {
    await prepare()
    rmSync(join(dir, DB_FILE))
    corrupt(join(dir, BACKUP_FILE))
    const { db, recovery } = await openOrRecoverDatabase(dir, [createTable], NOW)
    db.close()
    expect(recovery?.kind).toBe('recreated')
    expect(recovery?.brokenFile).toBeUndefined()
    expect(readdirSync(dir)).toContain(`${BACKUP_FILE}.broken-${NOW}`)
  })
})
