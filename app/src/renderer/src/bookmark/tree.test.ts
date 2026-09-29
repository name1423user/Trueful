import { describe, expect, it } from 'vitest'
import { buildTree, importMessageKey } from './tree'

const b = (
  id: number,
  parentId: number | null,
  kind: 'folder' | 'url',
  position: number
): { id: number; parentId: number | null; kind: 'folder' | 'url'; position: number } => ({
  id,
  parentId,
  kind,
  position
})

describe('ブックマークの木（F08）', () => {
  it('parentId で入れ子にし、同じフォルダの中は position 順', () => {
    const tree = buildTree([
      b(3, 1, 'url', 1),
      b(1, null, 'folder', 0),
      b(2, 1, 'url', 0),
      b(4, null, 'url', 1)
    ])
    expect(tree.map((n) => n.item.id)).toEqual([1, 4])
    expect(tree[0]!.children.map((n) => n.item.id)).toEqual([2, 3])
  })

  it('親が見つからない行は、一番上に出す（消えたように見えない）', () => {
    expect(buildTree([b(5, 99, 'url', 0)]).map((n) => n.item.id)).toEqual([5])
  })
})

describe('取り込み結果の文言のキー', () => {
  it('取り込んだ・見つからない・取りやめ・読めない、で分ける。取りやめは何も出さない', () => {
    expect(importMessageKey({ status: 'imported', imported: 3, failed: 0 })).toBe(
      'bookmark.imported'
    )
    expect(importMessageKey({ status: 'imported', imported: 3, failed: 2 })).toBe(
      'bookmark.importedWithFailures'
    )
    expect(importMessageKey({ status: 'not-found' })).toBe('bookmark.importNotFound')
    expect(importMessageKey({ status: 'unreadable' })).toBe('bookmark.importUnreadable')
    expect(importMessageKey({ status: 'cancelled' })).toBeUndefined()
  })
})
