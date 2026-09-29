import { describe, expect, it } from 'vitest'
import {
  downloadCancel,
  downloadList,
  downloadPause,
  downloadResume,
  downloadShowInFolder
} from './downloadChannels'

describe('download:* の引数', () => {
  it('list: Workspace の id は省略できる。正の整数だけ、余分な項目は拒否', () => {
    expect(downloadList.args.safeParse({}).success).toBe(true)
    expect(downloadList.args.safeParse({ workspaceId: 3 }).success).toBe(true)
    for (const bad of [undefined, { workspaceId: 0 }, { workspaceId: '3' }, { path: '/x' }]) {
      expect(downloadList.args.safeParse(bad).success).toBe(false)
    }
  })

  it('pause・resume・cancel・showInFolder: 正の整数の id だけ。パスは受け取らない', () => {
    for (const def of [downloadPause, downloadResume, downloadCancel, downloadShowInFolder]) {
      expect(def.args.safeParse({ id: 1 }).success).toBe(true)
      for (const bad of [
        undefined,
        {},
        { id: 0 },
        { id: 1.5 },
        { id: '1' },
        { id: 1, path: '/etc' }
      ]) {
        expect(def.args.safeParse(bad).success).toBe(false)
      }
    }
  })
})
