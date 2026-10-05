import { describe, expect, it } from 'vitest'
import {
  permissionAnswer,
  permissionList,
  permissionPrompts,
  permissionRevoke
} from './permissionChannels'

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
      { ...ok, origin: 'https://a.example/path' }, // origin の形（パスなし）だけ
      { ...ok, origin: 'HTTPS://A.EXAMPLE' },
      { ...ok, permission: 'usb' },
      { ...ok, extra: 1 },
      { workspaceId: 1, origin: 'https://a.example' }
    ]) {
      expect(permissionRevoke.args.safeParse(bad).success).toBe(false)
    }
  })

  it('prompts: 引数なし', () => {
    expect(permissionPrompts.args.safeParse(undefined).success).toBe(true)
    expect(permissionPrompts.args.safeParse({}).success).toBe(false)
  })

  it('answer: 確認の id と、許可・拒否・答えなしの 3 つだけ', () => {
    for (const answer of ['allow', 'deny', 'dismissed']) {
      expect(permissionAnswer.args.safeParse({ id: 1, answer }).success).toBe(true)
    }
    for (const bad of [
      { id: 0, answer: 'allow' },
      { id: 1.5, answer: 'allow' },
      { id: 1, answer: 'ask' },
      { id: 1 },
      { id: 1, answer: 'allow', remember: false }
    ]) {
      expect(permissionAnswer.args.safeParse(bad).success).toBe(false)
    }
  })
})
