import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertWorkspace } from '../services/workspaceDB'
import { comManifestPath, partitionDir, readComManifestId } from '../services/workspaceFiles'
import { ensureComManifests, prepareWorkspaceFiles } from './workspaceFileFlows'
import { createWorkspaceFlow } from './workspaceFlows'

let root: string
let db: DatabaseSync
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'trueful-wsf-'))
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
})
afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

describe('作成時のファイルの準備', () => {
  it('作ると COM 側のマニフェストができ、同じ id のパーティションの残りは消える', async () => {
    // DB をバックアップから戻したときなど、次に使われる id のパーティションが残っている
    mkdirSync(partitionDir(root, 1), { recursive: true })
    writeFileSync(join(partitionDir(root, 1), 'Cookies'), 'old')
    const create = createWorkspaceFlow(prepareWorkspaceFiles(root))
    const created = await create(db, { name: 'A', mode: 'custom', requestId: 'r1' })
    expect(created.id).toBe(1)
    expect(existsSync(partitionDir(root, 1))).toBe(false)
    expect(readComManifestId(root, 1)).toBe(1)
  })

  it('マニフェストを書けなければ、Workspace は作られない', async () => {
    writeFileSync(join(root, 'workspaces'), '') // フォルダを作れなくする
    const create = createWorkspaceFlow(prepareWorkspaceFiles(root))
    await expect(create(db, { name: 'A', mode: 'custom', requestId: 'r1' })).rejects.toMatchObject({
      name: 'WorkspaceFileError'
    })
    expect(db.prepare('SELECT count(*) AS n FROM workspace').get()).toEqual({ n: 0 })
  })
})

describe('起動時にマニフェストをそろえる', () => {
  it('ない・壊れているものだけを書き直し、正しいものには触らない', () => {
    const a = insertWorkspace(db, { name: 'A', mode: 'custom' }, 1)
    const b = insertWorkspace(db, { name: 'B', mode: 'custom' }, 2)
    const c = insertWorkspace(db, { name: 'C', mode: 'custom' }, 3)
    // a: 正しい、b: ない（T2-1c より前に作った Workspace）、c: 壊れている
    prepareWorkspaceFiles(root)(a)
    mkdirSync(join(root, 'workspaces', String(c.id)), { recursive: true })
    writeFileSync(comManifestPath(root, c.id), '{')
    expect(ensureComManifests(db, root)).toEqual({ repaired: [b.id, c.id], failed: [] })
    for (const w of [a, b, c]) expect(readComManifestId(root, w.id)).toBe(w.id)
    expect(ensureComManifests(db, root)).toEqual({ repaired: [], failed: [] })
  })

  it('書けないものがあっても、ほかは続けて、書けなかった id を返す', () => {
    const a = insertWorkspace(db, { name: 'A', mode: 'custom' }, 1)
    const b = insertWorkspace(db, { name: 'B', mode: 'custom' }, 2)
    // a のフォルダの場所にファイルを置いて、a だけ書けなくする
    mkdirSync(join(root, 'workspaces'), { recursive: true })
    writeFileSync(join(root, 'workspaces', String(a.id)), '')
    const result = ensureComManifests(db, root)
    expect(result.repaired).toEqual([b.id])
    expect(result.failed.map((f) => f.id)).toEqual([a.id])
  })
})
