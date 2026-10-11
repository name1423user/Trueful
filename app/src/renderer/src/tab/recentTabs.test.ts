import { describe, expect, it } from 'vitest'
import { recentTabs } from './recentTabs'

const tab = (id: number, lastActiveTimeMs: number): { id: number; lastActiveTimeMs: number } => ({
  id,
  lastActiveTimeMs
})

describe('最近使ったタブ列に並べるタブ（F15）', () => {
  it('最後に見た順に、枚数まで', () => {
    const tabs = [tab(1, 10), tab(2, 30), tab(3, 20), tab(4, 40)]
    expect(recentTabs(tabs, 3).map((t) => t.id)).toEqual([4, 2, 3])
    expect(recentTabs(tabs, 10).map((t) => t.id)).toEqual([4, 2, 3, 1])
  })

  it('同じ時刻なら id の小さい順（並びが揺れない）', () => {
    expect(recentTabs([tab(2, 5), tab(1, 5)], 5).map((t) => t.id)).toEqual([1, 2])
  })
})
