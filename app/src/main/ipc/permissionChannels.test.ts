import { describe, expect, it } from 'vitest'
import { permissionList, permissionRevoke } from './permissionChannels'

describe('permission:* の引数', () => {
  it('list: Workspace の id は省略できる。正の整数だけ、余分な項目は拒否', () => {
    expect(permissionList.args.safeParse({}).success).toBe(true)
    expect(permissionList.args.safeParse({ workspaceId: 2 }).success).toBe(true)
    for (const bad of [undefined, { workspaceId: 0 }, { workspaceId: 'a' }, { all: true }]) {
      expect(permissionList.args.safeParse(bad).success).toBe(false)
    }
  })

  it('revoke: Workspace・http(s) のサイト・知っている権限の 3 つがそろったものだけ', () => {
    const ok = { workspaceId: 1, origin: 'https://a.example', permission: 'camera' }
    expect(permissionRevoke.args.safeParse(ok).success).toBe(true)
    for (const bad of [
      { ...ok, workspaceId: 0 },
      { ...ok, origin: 'file:///x' },
      { ...ok, origin: 'a.example' },
      { ...ok, permission: 'usb' },
      { ...ok, extra: 1 },
      { workspaceId: 1, origin: 'https://a.example' }
    ]) {
      expect(permissionRevoke.args.safeParse(bad).success).toBe(false)
    }
  })
})
