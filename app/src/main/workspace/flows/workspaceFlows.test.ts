import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { listTabs, NEW_TAB_URL } from '../../tab/services/tabDB'
import { getCurrentWorkspaceId, listWorkspaces } from '../services/workspaceDB'
import {
  createWorkspaceFlow,
  deleteWorkspaceFlow,
  switchWorkspace,
  WorkspaceNotFoundError
} from './workspaceFlows'

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

describe('休止と復帰（F01・ADR-011）', () => {
  // 1000, 2000, ... の時刻で n 個作る
  const createMany = async (n: number): Promise<number[]> => {
    const create = createWorkspaceFlow()
    const ids: number[] = []
    for (let i = 0; i < n; i++) {
      const w = await create(
        db,
        { name: `W${i + 1}`, mode: 'custom', requestId: `r${i}` },
        (i + 1) * 1000
      )
      ids.push(w.id)
    }
    return ids
  }
  const statuses = (): [string, string, number | null][] =>
    listWorkspaces(db).map((w) => [w.name, w.status, w.dormantedTimeMs])

  it('5 個目までは休止しない。6 個目を作ると、いちばん長く使っていないものが休止する', async () => {
    await createMany(5)
    expect(listWorkspaces(db).every((w) => w.status === 'active')).toBe(true)
    await createWorkspaceFlow()(db, { name: 'W6', mode: 'custom', requestId: 'r6' }, 6000)
    expect(statuses()[0]).toEqual(['W1', 'dormant', 6000])
    expect(
      statuses()
        .slice(1)
        .every(([, s]) => s === 'active')
    ).toBe(true)
  })

  it('休止した Workspace に切り替えると復帰し、代わりにいちばん長く使っていないもの（自分以外）が休止する', async () => {
    const ids = await createMany(6)
    switchWorkspace(db, ids[0]!, 7000)
    expect(statuses()[0]).toEqual(['W1', 'active', null])
    expect(statuses()[1]).toEqual(['W2', 'dormant', 7000])
    expect(listWorkspaces(db).filter((w) => w.status === 'active')).toHaveLength(5)
    expect(getCurrentWorkspaceId(db)).toBe(ids[0])
  })

  it('フルアクティブの Workspace に切り替えても、上限内なら何も休止しない', async () => {
    const ids = await createMany(5)
    switchWorkspace(db, ids[0]!, 7000)
    expect(listWorkspaces(db).every((w) => w.status === 'active')).toBe(true)
  })
})

describe('Workspace の削除（F01）', () => {
  const make = async (names: string[]): Promise<number[]> => {
    const create = createWorkspaceFlow()
    const ids: number[] = []
    for (const [i, name] of names.entries()) {
      ids.push((await create(db, { name, mode: 'custom', requestId: `r${i}` }, 1000 + i)).id)
    }
    return ids
  }
  const snapshots = (): { workspace_id: number; snapshot_json: string }[] =>
    db.prepare('SELECT workspace_id, snapshot_json FROM workspace_snapshot').all() as never

  it('削除の前にスナップショットを1回書き、行とタブは消える。スナップショットは残る', async () => {
    const [a, b] = await make(['A', 'B'])
    const result = deleteWorkspaceFlow(db, a!, 5000)
    expect(result.tabIds).toHaveLength(1)
    expect(listWorkspaces(db).map((w) => w.id)).toEqual([b])
    expect(listTabs(db, a!)).toEqual([])
    expect(snapshots()).toHaveLength(1)
    expect(snapshots()[0]).toMatchObject({ workspace_id: a })
    expect(JSON.parse(snapshots()[0]!.snapshot_json)).toMatchObject({ name: 'A', mode: 'custom' })
  })

  it('今の Workspace を消したら、残りのうち最後に使ったものが今の Workspace になる', async () => {
    const [a, b, c] = await make(['A', 'B', 'C']) // C が今の Workspace
    switchWorkspace(db, a!, 3000)
    switchWorkspace(db, c!, 4000)
    expect(deleteWorkspaceFlow(db, c!, 5000).currentId).toBe(a)
    expect(getCurrentWorkspaceId(db)).toBe(a)
    expect(b).toBeDefined()
  })

  it('今でない Workspace を消しても、今の Workspace は変わらない', async () => {
    const [a, b] = await make(['A', 'B'])
    expect(deleteWorkspaceFlow(db, a!, 5000).currentId).toBe(b)
  })

  it('最後の1つを消すと、今の Workspace はなくなる', async () => {
    const [a] = await make(['A'])
    expect(deleteWorkspaceFlow(db, a!, 5000).currentId).toBeNull()
    expect(listWorkspaces(db)).toEqual([])
  })

  it('ない Workspace は WorkspaceNotFoundError、スナップショットも書かない', async () => {
    await make(['A'])
    expect(() => deleteWorkspaceFlow(db, 999)).toThrow()
    expect(snapshots()).toEqual([])
  })
})
