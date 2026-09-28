import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { listTabs, NEW_TAB_URL } from '../../tab/services/tabDB'
import { getCurrentWorkspaceId, listWorkspaces } from '../services/workspaceDB'
import { createWorkspaceFlow, switchWorkspace, WorkspaceNotFoundError } from './workspaceFlows'

let db: DatabaseSync
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
})

describe('Workspace の作成', () => {
  it('作ると一覧の一番下に足され、それが今の Workspace になる', async () => {
    const create = createWorkspaceFlow()
    const a = await create(db, { name: '案件A', mode: 'production', requestId: 'r1' }, 1000)
    const b = await create(db, { name: '案件B', mode: 'development', requestId: 'r2' }, 2000)
    expect(listWorkspaces(db).map((w) => [w.name, w.position])).toEqual([
      ['案件A', 0],
      ['案件B', 1]
    ])
    expect(b).toMatchObject({ mode: 'development', status: 'active', lastUsedTimeMs: 2000 })
    expect(getCurrentWorkspaceId(db)).toBe(b.id)
    expect(a.id).not.toBe(b.id)
  })

  it('作ると空のタブが1つ開く（F01）', async () => {
    const create = createWorkspaceFlow()
    const a = await create(db, { name: '案件A', mode: 'custom', requestId: 'r1' }, 1000)
    expect(listTabs(db, a.id)).toMatchObject([{ url: NEW_TAB_URL, lastActiveTimeMs: 1000 }])
  })

  it('同じ依頼（requestId）が二度届いても、1つしか作らない', async () => {
    const create = createWorkspaceFlow()
    const [first, second] = await Promise.all([
      create(db, { name: 'A', mode: 'custom', requestId: 'same' }),
      create(db, { name: 'A', mode: 'custom', requestId: 'same' })
    ])
    expect(second.id).toBe(first.id)
    expect(listWorkspaces(db)).toHaveLength(1)
  })

  it('同じ名前でも、別の依頼なら作れる（内部は id で区別する。SPEC のエッジケース）', async () => {
    const create = createWorkspaceFlow()
    await create(db, { name: 'A', mode: 'custom', requestId: 'r1' })
    await create(db, { name: 'A', mode: 'custom', requestId: 'r2' })
    expect(listWorkspaces(db)).toHaveLength(2)
  })

  it('途中で失敗したら何も残さない（行を足した後の失敗でも取り消す）', async () => {
    const create = createWorkspaceFlow()
    // 今の Workspace の記録（行を足した後の手順）を失敗させる
    db.exec(
      "CREATE TRIGGER fail_app_state BEFORE UPDATE ON app_state BEGIN SELECT RAISE(ABORT, 'boom'); END"
    )
    await expect(create(db, { name: 'A', mode: 'custom', requestId: 'r1' })).rejects.toThrow('boom')
    expect(listWorkspaces(db)).toHaveLength(0)
    db.exec('DROP TRIGGER fail_app_state')
    // 失敗した依頼は忘れるので、送り直せば作れる
    await create(db, { name: 'A', mode: 'custom', requestId: 'r1' })
    expect(listWorkspaces(db)).toHaveLength(1)
  })

  it('準備（prepare）が失敗したら行も取り消し、その id は飛ばす（同じ残りに当たって失敗し続けない）', async () => {
    const prepared: number[] = []
    const create = createWorkspaceFlow((w) => {
      prepared.push(w.id)
      if (w.id === 1) throw new Error('id 1 のフォルダを片付けられない')
    })
    await expect(create(db, { name: 'A', mode: 'custom', requestId: 'r1' })).rejects.toThrow(
      '片付けられない'
    )
    expect(listWorkspaces(db)).toHaveLength(0)
    expect(getCurrentWorkspaceId(db)).toBeNull()
    expect(db.prepare('SELECT count(*) AS n FROM tab').get()).toEqual({ n: 0 }) // 空のタブも取り消す
    const created = await create(db, { name: 'A', mode: 'custom', requestId: 'r1' })
    expect(created.id).toBe(2)
    expect(prepared).toEqual([1, 2])
    expect(listWorkspaces(db)).toHaveLength(1)
  })
})

describe('Workspace の切り替え', () => {
  it('最後に使った時刻を更新し、今の Workspace として記録する', async () => {
    const create = createWorkspaceFlow()
    const a = await create(db, { name: 'A', mode: 'custom', requestId: 'r1' }, 1000)
    await create(db, { name: 'B', mode: 'custom', requestId: 'r2' }, 2000)
    const switched = switchWorkspace(db, a.id, 3000)
    expect(switched.lastUsedTimeMs).toBe(3000)
    expect(getCurrentWorkspaceId(db)).toBe(a.id)
  })

  it('ない Workspace には切り替えず、今の Workspace も変えない', async () => {
    const create = createWorkspaceFlow()
    const a = await create(db, { name: 'A', mode: 'custom', requestId: 'r1' })
    expect(() => switchWorkspace(db, 999)).toThrow(WorkspaceNotFoundError)
    expect(getCurrentWorkspaceId(db)).toBe(a.id)
  })
})
