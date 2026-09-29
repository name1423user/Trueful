import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { listBookmarks } from '../services/bookmarkDB'
import { importFromFile } from './importFromFile'

let dir: string
let db: DatabaseSync
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trueful-bm-'))
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
})
afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const write = (name: string, content: string): string => {
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}
const chromeJson = JSON.stringify({
  roots: {
    bookmark_bar: {
      type: 'folder',
      name: 'バー',
      children: [
        { type: 'url', name: 'A', url: 'https://a.example/' },
        { type: 'url', name: 'bad', url: 'javascript:1' }
      ]
    }
  }
})

describe('ファイルからの取り込み（F08）', () => {
  it('Chrome の JSON を取り込み、件数（取り込んだ数・失敗した数）を返す', () => {
    const result = importFromFile(db, write('Bookmarks', chromeJson), 'chrome', 1000)
    expect(result).toEqual({ status: 'imported', imported: 1, failed: 1 })
    expect(listBookmarks(db).map((b) => b.title)).toEqual(['バー', 'A'])
  })

  it('HTML のエクスポートを取り込む', () => {
    const html = '<DL><DT><H3>F</H3><DL><DT><A HREF="https://a.example/">A</A></DL></DL>'
    expect(importFromFile(db, write('b.html', html), 'html', 1000)).toEqual({
      status: 'imported',
      imported: 1,
      failed: 0
    })
  })

  it('読めない・壊れている・種類が違うファイルは unreadable で、1件も入れない', () => {
    expect(importFromFile(db, join(dir, 'ない'), 'chrome', 1)).toEqual({ status: 'unreadable' })
    expect(importFromFile(db, write('broken', 'not json'), 'chrome', 1)).toEqual({
      status: 'unreadable'
    })
    expect(importFromFile(db, write('page.html', '<html>hi</html>'), 'html', 1)).toEqual({
      status: 'unreadable'
    })
    expect(importFromFile(db, dir, 'chrome', 1)).toEqual({ status: 'unreadable' }) // フォルダ
    expect(listBookmarks(db)).toEqual([])
  })

  it('大きすぎるファイル（上限を超えるもの）は読まずに unreadable', () => {
    const path = write('big', chromeJson)
    expect(importFromFile(db, path, 'chrome', 1, 10)).toEqual({ status: 'unreadable' })
    expect(importFromFile(db, path, 'chrome', 1, 1_000_000)).toMatchObject({ status: 'imported' })
    mkdirSync(join(dir, 'sub'))
  })
})
