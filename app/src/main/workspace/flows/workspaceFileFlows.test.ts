import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertWorkspace, listWorkspaces } from '../services/workspaceDB'
import {
  comManifestPath,
  partitionDir,
  readComManifest,
  trashDirs,
  workspaceDir,
  type WorkspaceRoots
} from '../services/workspaceFiles'
import {
  ensureComManifests,
  prepareWorkspaceFiles,
  purgeWorkspaceTrash
} from './workspaceFileFlows'
import { createWorkspaceFlow } from './workspaceFlows'

let base: string
let roots: WorkspaceRoots
let db: DatabaseSync
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'trueful-wsf-'))
  roots = { userData: join(base, 'user'), sessionData: join(base, 'session') }
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
})
afterEach(() => {
  db.close()
  rmSync(base, { recursive: true, force: true })
})

describe('作成時のファイルの準備', () => {
  it('同じ id の残り（パーティションと workspaces/<id>）を片付けてから、マニフェストを書く', async () => {
    // DB をバックアップから戻したときなど、次に使われる id のフォルダが残っている
    mkdirSync(partitionDir(roots, 1), { recursive: true })
    writeFileSync(join(partitionDir(roots, 1), 'Cookies'), 'old')
    mkdirSync(workspaceDir(roots, 1), { recursive: true })
    writeFileSync(join(workspaceDir(roots, 1), 'workspace.json'), '{"old":true}')
    const create = createWorkspaceFlow(prepareWorkspaceFiles(roots))
    const created = await create(db, { name: 'A', mode: 'custom', requestId: 'r1' })
    expect(created.id).toBe(1)
    expect(existsSync(partitionDir(roots, 1))).toBe(false)
    expect(readdirSync(workspaceDir(roots, 1))).toEqual(['com.json'])
    expect(readComManifest(roots, 1)).toBe('ok')

    expect(await purgeWorkspaceTrash(roots)).toEqual([])
    for (const trash of trashDirs(roots)) expect(existsSync(trash)).toBe(false)
  })

  it('マニフェストを書けなければ、Workspace は作られない', async () => {
    mkdirSync(roots.userData, { recursive: true })
    writeFileSync(join(roots.userData, 'workspaces'), '') // フォルダを作れなくする
    const create = createWorkspaceFlow(prepareWorkspaceFiles(roots))
    await expect(create(db, { name: 'A', mode: 'custom', requestId: 'r1' })).rejects.toMatchObject({
      name: 'WorkspaceFileError'
    })
    expect(listWorkspaces(db)).toHaveLength(0)
  })
})

describe('起動時にマニフェストをそろえる', () => {
  it('ない・壊れているものだけを書き直し、正しいものと新しい版のものには触らない', () => {
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((name, i) =>
      insertWorkspace(db, { name, mode: 'custom' }, i)
    )
    // a: 正しい、b: ない（T2-1c より前に作った Workspace）、c: 壊れている、d: 新しい版が書いた
    prepareWorkspaceFiles(roots)(a!)
    for (const w of [c!, d!]) mkdirSync(workspaceDir(roots, w.id), { recursive: true })
    writeFileSync(comManifestPath(roots, c!.id), '{')
    const newer = JSON.stringify({ schemaVersion: 9 })
    writeFileSync(comManifestPath(roots, d!.id), newer)

    expect(ensureComManifests(db, roots)).toEqual({ repaired: [b!.id, c!.id], failed: [] })
    for (const w of [a!, b!, c!]) expect(readComManifest(roots, w.id)).toBe('ok')
    expect(readComManifest(roots, d!.id)).toBe('newer')
    expect(ensureComManifests(db, roots)).toEqual({ repaired: [], failed: [] })
  })

  it('書けないものがあっても、ほかは続けて、書けなかった id を返す', () => {
    const a = insertWorkspace(db, { name: 'A', mode: 'custom' }, 1)
    const b = insertWorkspace(db, { name: 'B', mode: 'custom' }, 2)
    // a のフォルダの場所にファイルを置いて、a だけ書けなくする
    mkdirSync(join(roots.userData, 'workspaces'), { recursive: true })
    writeFileSync(workspaceDir(roots, a.id), '')
    const result = ensureComManifests(db, roots)
    expect(result.repaired).toEqual([b.id])
    expect(result.failed.map((f) => f.id)).toEqual([a.id])
  })
})
