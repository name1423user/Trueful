import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { TabNotFoundError } from '../../tab/flows/tabFlows'
import { getTab, insertTab, listTabs, NEW_TAB_URL } from '../../tab/services/tabDB'
import {
  getCurrentWorkspaceId,
  getWorkspace,
  listWorkspaces,
  setWorkspaceDormant
} from '../services/workspaceDB'
import {
  createWorkspaceFlow,
  deleteWorkspaceFlow,
  moveTabFlow,
  SameWorkspaceError,
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

describe('タブを別の Workspace へ移す（F17）', () => {
  // A と B を作り、A に URL つきのタブを2つ置く（A のタブ: 空・x・y。今の Workspace は B）
  async function setup(): Promise<{ a: number; b: number; x: number; y: number }> {
    const create = createWorkspaceFlow()
    const a = (await create(db, { name: 'A', mode: 'custom', requestId: 'r1' }, 1000)).id
    const b = (await create(db, { name: 'B', mode: 'production', requestId: 'r2' }, 2000)).id
    const x = insertTab(db, { workspaceId: a, url: 'https://x.example/', title: 'X' }, 1100).id
    const y = insertTab(db, { workspaceId: a, url: 'https://y.example/', title: 'Y' }, 1200).id
    return { a, b, x, y }
  }

  it('移動先に同じ URL とタイトルのタブが開き（選ばれる）、元の Workspace からは消える', async () => {
    const { a, b, x } = await setup()
    const moved = moveTabFlow(db, { tabId: x, fromWorkspaceId: a, toWorkspaceId: b }, 5000)
    expect(moved).toMatchObject({ workspaceId: b, url: 'https://x.example/', title: 'X' })
    const inB = listTabs(db, b)
    expect(inB.at(-1)).toMatchObject({ url: 'https://x.example/', lastActiveTimeMs: 5000 })
    expect(getTab(db, x)).toBeUndefined()
    // 元の並びは 0, 1, … にそろう
    expect(listTabs(db, a).map((t) => [t.url, t.position])).toEqual([
      [NEW_TAB_URL, 0],
      ['https://y.example/', 1]
    ])
  })

  it('今の Workspace は変えない（移したあとも、見ている Workspace のまま）', async () => {
    const { a, b, x } = await setup()
    moveTabFlow(db, { tabId: x, fromWorkspaceId: a, toWorkspaceId: b })
    expect(getCurrentWorkspaceId(db)).toBe(b)
  })

  it('最後の1つのタブを移すと、元の Workspace には空のタブが1つ開く', async () => {
    const create = createWorkspaceFlow()
    const a = (await create(db, { name: 'A', mode: 'custom', requestId: 'r1' }, 1000)).id
    const b = (await create(db, { name: 'B', mode: 'custom', requestId: 'r2' }, 2000)).id
    const only = listTabs(db, a)[0]!
    db.prepare('UPDATE tab SET url = ? WHERE id = ?').run('https://only.example/', only.id)
    moveTabFlow(db, { tabId: only.id, fromWorkspaceId: a, toWorkspaceId: b })
    expect(listTabs(db, a)).toMatchObject([{ url: NEW_TAB_URL, position: 0 }])
  })

  it('移動先が休止していたら復帰させる（休止の時刻は消え、最後に使った時刻を更新する）', async () => {
    const { a, b } = await setup()
    setWorkspaceDormant(db, a, 3000)
    expect(getWorkspace(db, a)!.status).toBe('dormant')
    // A（休止）へ、B のタブを移す
    const t = insertTab(db, { workspaceId: b, url: 'https://t.example/' }, 3500).id
    moveTabFlow(db, { tabId: t, fromWorkspaceId: b, toWorkspaceId: a }, 4000)
    expect(getWorkspace(db, a)).toMatchObject({
      status: 'active',
      dormantedTimeMs: null,
      lastUsedTimeMs: 4000
    })
  })

  it('復帰で上限（5 個）を超えたら、ほかの Workspace を休止にする。ただし見ている今の Workspace は休止にしない', async () => {
    const create = createWorkspaceFlow()
    const ids: number[] = []
    for (let i = 0; i < 6; i++) {
      // 6 個目を作ると、いちばん古い 1 個目が休止する
      ids.push(
        (await create(db, { name: `W${i}`, mode: 'custom', requestId: `r${i}` }, 1000 * (i + 1))).id
      )
    }
    const [first, second, third] = ids as [number, number, number]
    expect(getWorkspace(db, first)!.status).toBe('dormant')
    // 2 個目を今の Workspace にする（最後に使った時刻は 1500。active の中でいちばん古い）
    switchWorkspace(db, second, 1500)
    const moving = insertTab(db, { workspaceId: second, url: 'https://m.example/' }, 1600).id
    moveTabFlow(db, { tabId: moving, fromWorkspaceId: second, toWorkspaceId: first }, 7000)
    expect(getWorkspace(db, first)!.status).toBe('active') // 復帰
    expect(getWorkspace(db, second)!.status).toBe('active') // 今の Workspace は守る
    expect(getWorkspace(db, third)!.status).toBe('dormant') // 次に古いものが休止
    expect(getCurrentWorkspaceId(db)).toBe(second)
  })

  it('元の Workspace では、選ばれていたタブを移すと、前に使っていたタブが選ばれる。移動先では、移したタブが末尾に入り、ほかの並びは変わらない', async () => {
    const { a, b, x, y } = await setup() // y が A で最後に選ばれたタブ
    const inB = insertTab(db, { workspaceId: b, url: 'https://b.example/' }, 1300).id
    moveTabFlow(db, { tabId: y, fromWorkspaceId: a, toWorkspaceId: b }, 5000)
    // A: 空のタブ・x のうち、最後に選んだのは x
    const active = db
      .prepare(
        'SELECT id FROM tab WHERE workspace_id = ? ORDER BY last_active_time_ms DESC LIMIT 1'
      )
      .get(a) as { id: number }
    expect(active.id).toBe(x)
    expect(listTabs(db, b).map((t) => [t.url, t.position])).toEqual([
      [NEW_TAB_URL, 0],
      ['https://b.example/', 1],
      ['https://y.example/', 2]
    ])
    expect(inB).toBeDefined()
  })

  it('移動先が休止していなければ、最後に使った時刻は変えない', async () => {
    const { a, b, x } = await setup()
    const before = getWorkspace(db, b)!.lastUsedTimeMs
    moveTabFlow(db, { tabId: x, fromWorkspaceId: a, toWorkspaceId: b }, 9000)
    expect(getWorkspace(db, b)!.lastUsedTimeMs).toBe(before)
  })

  it('タブが元の Workspace のものでなければ TabNotFoundError、移動先がなければ WorkspaceNotFoundError、同じ Workspace なら SameWorkspaceError。どれも何も変えない', async () => {
    const { a, b, x } = await setup()
    const snapshot = (): unknown => [listTabs(db, a), listTabs(db, b)]
    const before = snapshot()
    expect(() => moveTabFlow(db, { tabId: x, fromWorkspaceId: b, toWorkspaceId: a })).toThrow(
      TabNotFoundError
    )
    expect(() => moveTabFlow(db, { tabId: 999, fromWorkspaceId: a, toWorkspaceId: b })).toThrow(
      TabNotFoundError
    )
    expect(() => moveTabFlow(db, { tabId: x, fromWorkspaceId: a, toWorkspaceId: 999 })).toThrow(
      WorkspaceNotFoundError
    )
    expect(() => moveTabFlow(db, { tabId: x, fromWorkspaceId: a, toWorkspaceId: a })).toThrow(
      SameWorkspaceError
    )
    expect(snapshot()).toEqual(before)
  })

  it('復帰させたあとに失敗しても、休止のまま戻る（復帰も取り消す）', async () => {
    const { a, b, x } = await setup()
    setWorkspaceDormant(db, b, 3000)
    db.exec(
      "CREATE TRIGGER fail_delete BEFORE DELETE ON tab BEGIN SELECT RAISE(ABORT, 'boom'); END"
    )
    expect(() => moveTabFlow(db, { tabId: x, fromWorkspaceId: a, toWorkspaceId: b }, 4000)).toThrow(
      'boom'
    )
    expect(getWorkspace(db, b)).toMatchObject({ status: 'dormant', dormantedTimeMs: 3000 })
  })

  it('途中で失敗したら何も残さない（移動先に足した後に、元のタブを消せなかったとき）', async () => {
    const { a, b, x } = await setup()
    db.exec(
      "CREATE TRIGGER fail_delete BEFORE DELETE ON tab BEGIN SELECT RAISE(ABORT, 'boom'); END"
    )
    const before = [listTabs(db, a), listTabs(db, b)]
    expect(() => moveTabFlow(db, { tabId: x, fromWorkspaceId: a, toWorkspaceId: b })).toThrow(
      'boom'
    )
    expect([listTabs(db, a), listTabs(db, b)]).toEqual(before)
  })
})
