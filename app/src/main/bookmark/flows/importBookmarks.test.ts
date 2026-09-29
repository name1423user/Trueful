import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertBookmark, listBookmarks } from '../services/bookmarkDB'
import type { ImportNode } from '../services/bookmarkTree'
import { importBookmarks } from './importBookmarks'

let db: DatabaseSync
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
})

const tree: ImportNode[] = [
  {
    kind: 'folder',
    title: 'バー',
    children: [
      { kind: 'url', title: 'A', url: 'https://a.example/' },
      {
        kind: 'folder',
        title: '開発',
        children: [{ kind: 'url', title: 'B', url: 'https://b.example/' }]
      }
    ]
  },
  { kind: 'url', title: 'C', url: 'https://c.example/' }
]

describe('ブックマークの取り込み（F08）', () => {
  it('フォルダ構造ごと入れ、件数（取り込んだ数・失敗した数）を返す。フォルダは件数に入れない', () => {
    const result = importBookmarks(db, { nodes: tree, failed: 2 }, 1000)
    expect(result).toEqual({ imported: 3, failed: 2 })
    const all = listBookmarks(db)
    const bar = all.find((b) => b.title === 'バー')!
    const dev = all.find((b) => b.title === '開発')!
    expect(dev.parentId).toBe(bar.id)
    expect(all.find((b) => b.title === 'B')!.parentId).toBe(dev.id)
    expect(all.filter((b) => b.parentId === null).map((b) => b.title)).toEqual(['バー', 'C'])
  })

  it('すでにあるブックマークの後ろに足す。同じ URL があっても重ねて入れる（消さない）', () => {
    insertBookmark(db, { kind: 'url', title: 'A', url: 'https://a.example/' }, 1)
    importBookmarks(
      db,
      { nodes: [{ kind: 'url', title: 'A', url: 'https://a.example/' }], failed: 0 },
      2
    )
    expect(listBookmarks(db).map((b) => b.position)).toEqual([0, 1])
  })

  it('途中で失敗したら、1件も入れない（1 トランザクション）', () => {
    const bad: ImportNode[] = [
      { kind: 'url', title: 'ok', url: 'https://ok.example/' },
      { kind: 'url', title: 'bad', url: 'javascript:alert(1)' }
    ]
    expect(() => importBookmarks(db, { nodes: bad, failed: 0 }, 1)).toThrow()
    expect(listBookmarks(db)).toEqual([])
  })
})
