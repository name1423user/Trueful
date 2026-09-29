import { describe, expect, it } from 'vitest'
import { workspaceCreate, workspaceDelete } from './workspaceChannels'

describe('workspace:create の引数', () => {
  const args = (name: string): unknown => ({
    name,
    mode: 'custom',
    requestId: '00000000-0000-4000-8000-000000000000'
  })

  it('名前は前後の空白を除いて 1〜100文字（絵文字や𠮷も1文字と数える）', () => {
    expect(workspaceCreate.args.safeParse(args('  案件A  ')).data).toMatchObject({ name: '案件A' })
    expect(workspaceCreate.args.safeParse(args('𠮷'.repeat(100))).success).toBe(true)
    expect(workspaceCreate.args.safeParse(args('a'.repeat(101))).success).toBe(false)
    expect(workspaceCreate.args.safeParse(args('   ')).success).toBe(false)
  })

  it('Mode と requestId の形も確かめる', () => {
    expect(workspaceCreate.args.safeParse({ ...(args('A') as object), mode: 'prod' }).success).toBe(
      false
    )
    expect(
      workspaceCreate.args.safeParse({ ...(args('A') as object), requestId: 'x' }).success
    ).toBe(false)
  })
})

describe('workspace:delete の引数', () => {
  it('正の整数の id だけ受け付け、余分な項目・不正な値は拒否する', () => {
    expect(workspaceDelete.args.safeParse({ id: 3 }).success).toBe(true)
    for (const bad of [undefined, {}, { id: 0 }, { id: -1 }, { id: 1.5 }, { id: '3' }]) {
      expect(workspaceDelete.args.safeParse(bad).success).toBe(false)
    }
    expect(workspaceDelete.args.safeParse({ id: 3, force: true }).success).toBe(false)
  })
})
