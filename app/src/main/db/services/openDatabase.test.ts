import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './openDatabase'

describe('openDatabase', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trueful-open-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('外部キーと WAL を有効にして開く', () => {
    const db = openDatabase(join(dir, 'trueful.db'))
    try {
      expect(db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys']).toBe(1)
      expect(db.prepare('PRAGMA journal_mode').get()?.['journal_mode']).toBe('wal')
    } finally {
      db.close()
    }
  })

  it('開けなかったときは接続を閉じる（ファイルを掴んだままにしない）', () => {
    const path = join(dir, 'trueful.db')
    writeFileSync(path, 'not a database '.repeat(10))
    expect(() => openDatabase(path)).toThrow()
    // 掴んだままだと、Windows では名前を変えられない
    expect(() => renameSync(path, `${path}.moved`)).not.toThrow()
  })
})
