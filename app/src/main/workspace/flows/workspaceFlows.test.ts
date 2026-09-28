import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { getCurrentWorkspaceId, listWorkspaces } from '../services/workspaceDB'
import { createWorkspaceFlow, switchWorkspace, WorkspaceNotFoundError } from './workspaceFlows'

let db: DatabaseSync
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
})

describe('Workspace の作成', () => {
  it('作ると一覧の一番下に足され、それが今の Workspace になる', () => {
    const create = createWorkspaceFlow()
    const a = create(db, { name: '案件A', mode: 'production', requestId: 'r1' }, 1000)
    const b = create(db, { name: '案件B', mode: 'development', requestId: 'r2' }, 2000)
    expect(listWorkspaces(db).map((w) => [w.name, w.position])).toEqual([
      ['案件A', 0],
      ['案件B', 1]
    ])
    expect(b).toMatchObject({ mode: 'development', status: 'active', lastUsedTimeMs: 2000 })
    expect(getCurrentWorkspaceId(db)).toBe(b.id)
    expect(a.id).not.toBe(b.id)
  })

  it('同じ依頼（requestId）が二度届いても、1つしか作らない', () => {
    const create = createWorkspaceFlow()
    const first = create(db, { name: 'A', mode: 'custom', requestId: 'same' })
    const second = create(db, { name: 'A', mode: 'custom', requestId: 'same' })
    expect(second.id).toBe(first.id)
    expect(listWorkspaces(db)).toHaveLength(1)
  })

  it('同じ名前でも、別の依頼なら作れる（内部は id で区別する。SPEC のエッジケース）', () => {
    const create = createWorkspaceFlow()
    create(db, { name: 'A', mode: 'custom', requestId: 'r1' })
    create(db, { name: 'A', mode: 'custom', requestId: 'r2' })
    expect(listWorkspaces(db)).toHaveLength(2)
  })

  it('途中で失敗したら何も残さない', () => {
    const create = createWorkspaceFlow()
    // DB の制約（名前が空）で失敗させる
    expect(() => create(db, { name: '', mode: 'custom', requestId: 'r1' })).toThrow()
    expect(listWorkspaces(db)).toHaveLength(0)
    expect(getCurrentWorkspaceId(db)).toBeNull()
  })
})

describe('Workspace の切り替え', () => {
  it('最後に使った時刻を更新し、今の Workspace として記録する', () => {
    const create = createWorkspaceFlow()
    const a = create(db, { name: 'A', mode: 'custom', requestId: 'r1' }, 1000)
    create(db, { name: 'B', mode: 'custom', requestId: 'r2' }, 2000)
    const switched = switchWorkspace(db, a.id, 3000)
    expect(switched.lastUsedTimeMs).toBe(3000)
    expect(getCurrentWorkspaceId(db)).toBe(a.id)
  })

  it('ない Workspace には切り替えず、今の Workspace も変えない', () => {
    const create = createWorkspaceFlow()
    const a = create(db, { name: 'A', mode: 'custom', requestId: 'r1' })
    expect(() => switchWorkspace(db, 999)).toThrow(WorkspaceNotFoundError)
    expect(getCurrentWorkspaceId(db)).toBe(a.id)
  })
})
