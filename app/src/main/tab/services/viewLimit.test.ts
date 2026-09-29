import { describe, expect, it } from 'vitest'
import { MAX_PAGE_VIEWS, viewsToDiscard } from './viewLimit'

// n 個のページ。id 1 がいちばん古く表示したもの
const views = (n: number): { tabId: number; lastShown: number }[] =>
  Array.from({ length: n }, (_, i) => ({ tabId: i + 1, lastShown: 1000 + i }))

describe('ページの実体の上限（F02: 全 Workspace で 30 個）', () => {
  it('上限は 30 個', () => {
    expect(MAX_PAGE_VIEWS).toBe(30)
  })

  it('29 個・30 個なら何も破棄しない', () => {
    expect(viewsToDiscard(views(29), 30, 29)).toEqual([])
    expect(viewsToDiscard(views(30), 30, 30)).toEqual([])
  })

  it('31 個目ができたら、いちばん長く表示していないものを1つ破棄する', () => {
    expect(viewsToDiscard(views(31), 30, 31)).toEqual([1])
  })

  it('表示中のページは、いちばん古くても破棄しない', () => {
    expect(viewsToDiscard(views(31), 30, 1)).toEqual([2])
  })

  it('上限を下げたときは、超えた分だけ古い順に破棄する', () => {
    expect(viewsToDiscard(views(5), 2, 5)).toEqual([1, 2, 3])
  })

  it('並び順に頼らず、表示した順で選ぶ', () => {
    const shuffled = [
      { tabId: 7, lastShown: 50 },
      { tabId: 3, lastShown: 10 },
      { tabId: 9, lastShown: 30 }
    ]
    expect(viewsToDiscard(shuffled, 2, 7)).toEqual([3])
  })
})
