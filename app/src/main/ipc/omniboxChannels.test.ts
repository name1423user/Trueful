import { describe, expect, it } from 'vitest'
import { omniboxSuggest } from './omniboxChannels'

describe('omnibox:* の引数', () => {
  it('suggest: 文字列（2048 文字まで）と、今の Workspace の id（なければ null）', () => {
    expect(omniboxSuggest.args.safeParse({ query: 'react', workspaceId: 1 }).success).toBe(true)
    expect(omniboxSuggest.args.safeParse({ query: '', workspaceId: null }).success).toBe(true)
    for (const bad of [
      undefined,
      { query: 'a'.repeat(2049), workspaceId: 1 },
      { query: 'a', workspaceId: 0 },
      { query: 'a' },
      { query: 1, workspaceId: 1 },
      { query: 'a', workspaceId: 1, limit: 5 }
    ]) {
      expect(omniboxSuggest.args.safeParse(bad).success).toBe(false)
    }
  })
})
