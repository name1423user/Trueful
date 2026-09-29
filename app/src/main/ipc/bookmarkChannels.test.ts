import { describe, expect, it } from 'vitest'
import {
  bookmarkAdd,
  bookmarkDelete,
  bookmarkImportChrome,
  bookmarkImportHtml,
  bookmarkList,
  bookmarkMove,
  bookmarkUpdate
} from './bookmarkChannels'

describe('bookmark:* の引数', () => {
  it('add: フォルダは URL なし、URL は http・https の url が必要。余分な項目は拒否', () => {
    const ok = (v: unknown): boolean => bookmarkAdd.args.safeParse(v).success
    expect(ok({ kind: 'folder', title: 'F' })).toBe(true)
    expect(ok({ kind: 'url', title: 'A', url: 'https://a.example/', parentId: 3 })).toBe(true)
    expect(ok({ kind: 'url', title: 'A' })).toBe(false)
    expect(ok({ kind: 'url', title: 'A', url: 'javascript:alert(1)' })).toBe(false)
    expect(ok({ kind: 'folder', title: 'F', url: 'https://a.example/' })).toBe(false)
    expect(ok({ kind: 'url', title: 'A'.repeat(1001), url: 'https://a.example/' })).toBe(false)
    expect(ok({ kind: 'url', title: 'A', url: 'https://a.example/', extra: 1 })).toBe(false)
    expect(ok({ kind: 'file', title: 'A' })).toBe(false)
    expect(ok({ kind: 'folder', title: 'F', parentId: 0 })).toBe(false)
  })

  it('update: id と、title・url のどちらか。url は http・https', () => {
    const ok = (v: unknown): boolean => bookmarkUpdate.args.safeParse(v).success
    expect(ok({ id: 1, title: 'x' })).toBe(true)
    expect(ok({ id: 1, url: 'http://x.example/' })).toBe(true)
    expect(ok({ id: 1 })).toBe(false)
    expect(ok({ id: 1, url: 'file:///x' })).toBe(false)
    expect(ok({ id: 0, title: 'x' })).toBe(false)
  })

  it('delete・move: 正の整数の id。move の移動先は正の整数か null', () => {
    expect(bookmarkDelete.args.safeParse({ id: 1 }).success).toBe(true)
    expect(bookmarkDelete.args.safeParse({ id: '1' }).success).toBe(false)
    expect(bookmarkMove.args.safeParse({ id: 1, parentId: null }).success).toBe(true)
    expect(bookmarkMove.args.safeParse({ id: 1, parentId: 2 }).success).toBe(true)
    expect(bookmarkMove.args.safeParse({ id: 1 }).success).toBe(false)
    expect(bookmarkMove.args.safeParse({ id: 1, parentId: -1 }).success).toBe(false)
  })

  it('list・importChrome・importHtml は引数なし', () => {
    for (const def of [bookmarkList, bookmarkImportChrome, bookmarkImportHtml]) {
      expect(def.args.safeParse(undefined).success).toBe(true)
      expect(def.args.safeParse({ path: '/etc/passwd' }).success).toBe(false)
    }
  })
})
