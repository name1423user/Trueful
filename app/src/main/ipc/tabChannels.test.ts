import { describe, expect, it } from 'vitest'
import { tabActivate, tabClose, tabCreate, tabList, tabReopenClosed } from './tabChannels'

describe('tab:* の引数', () => {
  it('id と workspaceId は正の整数だけ。知らない項目は拒否する', () => {
    for (const def of [tabList, tabCreate, tabReopenClosed]) {
      expect(def.args.safeParse({ workspaceId: 1 }).success).toBe(true)
      for (const bad of [{ workspaceId: 0 }, { workspaceId: 1.5 }, { workspaceId: '1' }, {}]) {
        expect(def.args.safeParse(bad).success).toBe(false)
      }
      expect(def.args.safeParse({ workspaceId: 1, url: 'https://a.example/' }).success).toBe(false)
    }
    for (const def of [tabClose, tabActivate]) {
      expect(def.args.safeParse({ id: 3 }).success).toBe(true)
      expect(def.args.safeParse({ id: -1 }).success).toBe(false)
      expect(def.args.safeParse(3).success).toBe(false)
    }
  })
})
