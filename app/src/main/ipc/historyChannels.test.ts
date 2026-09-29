import { describe, expect, it } from 'vitest'
import { historyDelete, historySearch } from './historyChannels'

describe('history:search の引数', () => {
  it('query は文字列（500 文字まで）、workspaceId は正の整数、limit は 1〜100', () => {
    expect(historySearch.args.safeParse({ query: 'react' }).success).toBe(true)
    expect(historySearch.args.safeParse({ query: '', workspaceId: 1, limit: 100 }).success).toBe(
      true
    )
    for (const bad of [
      undefined,
      {},
      { query: 1 },
      { query: 'a'.repeat(501) },
      { query: 'a', workspaceId: 0 },
      { query: 'a', limit: 0 },
      { query: 'a', limit: 101 },
      { query: 'a', extra: 1 }
    ]) {
      expect(historySearch.args.safeParse(bad).success).toBe(false)
    }
  })
})

describe('history:delete の引数', () => {
  it('範囲は省略できる（全部）。両端は 0 以上の整数で、from ≤ to', () => {
    expect(historyDelete.args.safeParse({}).success).toBe(true)
    expect(historyDelete.args.safeParse({ fromMs: 0, toMs: 10 }).success).toBe(true)
    for (const bad of [
      undefined,
      { fromMs: -1 },
      { toMs: 1.5 },
      { fromMs: 10, toMs: 5 },
      { fromMs: '1' },
      { all: true }
    ]) {
      expect(historyDelete.args.safeParse(bad).success).toBe(false)
    }
  })
})
