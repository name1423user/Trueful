import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import {
  deleteBookmark,
  insertBookmark,
  listBookmarks,
  moveBookmark,
  searchBookmarks,
  updateBookmark
} from './bookmarkDB'

let db: DatabaseSync
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
})

const titles = (parentId: number | null = null): string[] =>
  listBookmarks(db)
    .filter((b) => b.parentId === parentId)
    .map((b) => b.title)

describe('ブックマークの追加・編集・削除（F08）', () => {
  it('追加すると、同じフォルダの一番下に入る', () => {
    insertBookmark(db, { kind: 'url', title: 'A', url: 'https://a.example/' }, 1)
    insertBookmark(db, { kind: 'url', title: 'B', url: 'https://b.example/' }, 2)
    const folder = insertBookmark(db, { kind: 'folder', title: 'F' }, 3)
    insertBookmark(
      db,
      { kind: 'url', title: 'C', url: 'https://c.example/', parentId: folder.id },
      4
    )
    expect(titles()).toEqual(['A', 'B', 'F'])
    expect(titles(folder.id)).toEqual(['C'])
    expect(listBookmarks(db)[0]).toMatchObject({ kind: 'url', position: 0, createdTimeMs: 1 })
  })

  it('URL は http・https だけ。フォルダに URL、URL にフォルダの親でないものは拒否する', () => {
    expect(() =>
      insertBookmark(db, { kind: 'url', title: 'x', url: 'javascript:alert(1)' }, 1)
    ).toThrow()
    expect(() => insertBookmark(db, { kind: 'url', title: 'x' }, 1)).toThrow()
    const a = insertBookmark(db, { kind: 'url', title: 'A', url: 'https://a.example/' }, 1)
    expect(() =>
      insertBookmark(db, { kind: 'url', title: 'x', url: 'https://x.example/', parentId: a.id }, 1)
    ).toThrow()
  })

  it('タイトルと URL を編集できる（種類は変えない。URL の検証は追加と同じ）', () => {
    const a = insertBookmark(db, { kind: 'url', title: 'A', url: 'https://a.example/' }, 1)
    updateBookmark(db, a.id, { title: 'A2', url: 'https://a2.example/' })
    expect(listBookmarks(db)[0]).toMatchObject({ title: 'A2', url: 'https://a2.example/' })
    expect(() => updateBookmark(db, a.id, { url: 'file:///etc/passwd' })).toThrow()
    expect(updateBookmark(db, 999, { title: 'x' })).toBe(false)
  })

  it('消したら、同じフォルダの順番を詰める', () => {
    const a = insertBookmark(db, { kind: 'url', title: 'A', url: 'https://a.example/' }, 1)
    insertBookmark(db, { kind: 'url', title: 'B', url: 'https://b.example/' }, 2)
    insertBookmark(db, { kind: 'url', title: 'C', url: 'https://c.example/' }, 3)
    deleteBookmark(db, a.id)
    expect(listBookmarks(db).map((b) => [b.title, b.position])).toEqual([
      ['B', 0],
      ['C', 1]
    ])
  })

  it('フォルダを消すと、中身もいっしょに消える。ない id は false', () => {
    const f = insertBookmark(db, { kind: 'folder', title: 'F' }, 1)
    insertBookmark(db, { kind: 'url', title: 'C', url: 'https://c.example/', parentId: f.id }, 2)
    expect(deleteBookmark(db, f.id)).toBe(true)
    expect(listBookmarks(db)).toEqual([])
    expect(deleteBookmark(db, f.id)).toBe(false)
  })
})

describe('フォルダの移動（循環しない）', () => {
  it('別のフォルダの一番下へ移せる。元のフォルダの順番は詰める', () => {
    const f = insertBookmark(db, { kind: 'folder', title: 'F' }, 1)
    const a = insertBookmark(db, { kind: 'url', title: 'A', url: 'https://a.example/' }, 2)
    insertBookmark(db, { kind: 'url', title: 'B', url: 'https://b.example/' }, 3)
    moveBookmark(db, a.id, f.id)
    expect(titles(f.id)).toEqual(['A'])
    expect(
      listBookmarks(db)
        .filter((b) => b.parentId === null)
        .map((b) => b.position)
    ).toEqual([0, 1])
  })

  it('URL の下へは移せない（親はフォルダだけ）', () => {
    const f = insertBookmark(db, { kind: 'folder', title: 'F' }, 1)
    const a = insertBookmark(db, { kind: 'url', title: 'A', url: 'https://a.example/' }, 2)
    expect(() => moveBookmark(db, f.id, a.id)).toThrow()
  })

  it('自分自身・自分の中のフォルダへは移せない', () => {
    const f = insertBookmark(db, { kind: 'folder', title: 'F' }, 1)
    const g = insertBookmark(db, { kind: 'folder', title: 'G', parentId: f.id }, 2)
    expect(() => moveBookmark(db, f.id, f.id)).toThrow()
    expect(() => moveBookmark(db, f.id, g.id)).toThrow()
    moveBookmark(db, g.id, null) // 一番上へは移せる
    expect(titles()).toEqual(['F', 'G'])
  })
})

describe('検索（統合検索欄の候補。F08・F10）', () => {
  it('タイトルと URL の部分一致（大文字小文字を区別しない）。フォルダは出さない', () => {
    const f = insertBookmark(db, { kind: 'folder', title: 'React 資料' }, 1)
    insertBookmark(
      db,
      { kind: 'url', title: 'React 入門', url: 'https://a.example/', parentId: f.id },
      2
    )
    insertBookmark(db, { kind: 'url', title: 'Vue', url: 'https://react-tips.example/' }, 3)
    insertBookmark(db, { kind: 'url', title: 'Other', url: 'https://o.example/' }, 4)
    expect(
      searchBookmarks(db, 'REACT')
        .map((b) => b.title)
        .sort()
    ).toEqual(['React 入門', 'Vue'])
    expect(searchBookmarks(db, '入門')).toHaveLength(1) // 2文字
    expect(searchBookmarks(db, '%')).toEqual([])
    expect(searchBookmarks(db, '  ')).toEqual([])
  })
})
