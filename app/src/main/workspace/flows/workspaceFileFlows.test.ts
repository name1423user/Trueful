import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import {
  insertWorkspace,
  lastWorkspaceId,
  listWorkspaces,
  skipWorkspaceId
} from '../services/workspaceDB'
import {
  comManifestPath,
  partitionDir,
  readComManifest,
  trashDirs,
  workspaceDir,
  type WorkspaceRoots
} from '../services/workspaceFiles'
import { insertSnapshot } from '../services/workspaceSnapshot'
import {
  cleanupDeletedWorkspaceFiles,
  collectWorkspaceNotices,
  ensureComManifests,
  sweepUnfinishedWorkspaces,
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

    expect(ensureComManifests(db, roots)).toEqual({
      repaired: [b!.id, c!.id],
      missing: [b!.id],
      failed: []
    })
    for (const w of [a!, b!, c!]) expect(readComManifest(roots, w.id)).toBe('ok')
    expect(readComManifest(roots, d!.id)).toBe('newer')
    expect(ensureComManifests(db, roots)).toEqual({ repaired: [], missing: [], failed: [] })
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

describe('削除した Workspace のファイルの片付け（F01）', () => {
  const setup = (id: number): void => {
    mkdirSync(partitionDir(roots, id), { recursive: true })
    writeFileSync(join(partitionDir(roots, id), 'Cookies'), 'secret')
    mkdirSync(workspaceDir(roots, id), { recursive: true })
    writeFileSync(join(workspaceDir(roots, id), 'com.json'), '{"id":7}')
  }

  it('先にセッションのデータを消し、フォルダは片付け用の場所へ移してから消す', async () => {
    setup(7)
    const calls: number[] = []
    const errors = await cleanupDeletedWorkspaceFiles(roots, 7, async (id) => void calls.push(id))
    expect(calls).toEqual([7])
    expect(errors).toEqual([])
    expect(existsSync(partitionDir(roots, 7))).toBe(false)
    expect(existsSync(workspaceDir(roots, 7))).toBe(false)
    for (const dir of trashDirs(roots)) expect(existsSync(dir)).toBe(false)
  })

  it('セッションのデータを消せなくても、フォルダの片付けは続ける。失敗は返す', async () => {
    setup(7)
    const errors = await cleanupDeletedWorkspaceFiles(roots, 7, async () => {
      throw new Error('clear failed')
    })
    expect(errors).toHaveLength(1)
    expect(existsSync(partitionDir(roots, 7))).toBe(false)
  })

  it('フォルダがなくても失敗しない', async () => {
    expect(await cleanupDeletedWorkspaceFiles(roots, 9, async () => {})).toEqual([])
  })
})

// ADR-012 の3パターン（F12）。① json が読めない → 書き直して軽く知らせる、
// ② 作成の途中で終わった（DB にない Workspace のフォルダ）→ 片付けて作成へ誘導、③ フォルダが消えた → 強く知らせる
describe('ADR-012 の3パターン', () => {
  it('① マニフェストが読めない: 書き直し、repaired に入る（フォルダが消えたことにはしない）', () => {
    const a = insertWorkspace(db, { name: 'A', mode: 'custom' }, 1)
    prepareWorkspaceFiles(roots)(a)
    writeFileSync(comManifestPath(roots, a.id), '{"id":')
    expect(ensureComManifests(db, roots)).toEqual({ repaired: [a.id], missing: [], failed: [] })
    expect(readComManifest(roots, a.id)).toBe('ok')
  })

  it('② DB にない番号のフォルダ（作成の途中で終わった）は片付け用の場所へ移し、その番号を返す', () => {
    const a = insertWorkspace(db, { name: 'A', mode: 'custom' }, 1)
    prepareWorkspaceFiles(roots)(a)
    // 作成のトランザクションの中でファイルを書いた後、確定する前に終わった（番号 2 は DB にない）
    prepareWorkspaceFiles(roots)({ ...a, id: 2 })
    mkdirSync(partitionDir(roots, 2), { recursive: true })
    // 番号でない名前（片付け用の場所など）には触らない
    mkdirSync(trashDirs(roots)[0]!, { recursive: true })
    expect(sweepUnfinishedWorkspaces(db, roots)).toEqual([2])
    expect(existsSync(workspaceDir(roots, 2))).toBe(false)
    expect(existsSync(partitionDir(roots, 2))).toBe(false)
    expect(existsSync(workspaceDir(roots, a.id))).toBe(true)
    expect(existsSync(trashDirs(roots)[0]!)).toBe(true)
    expect(sweepUnfinishedWorkspaces(db, roots)).toEqual([])
  })

  it('② フォルダがまだなければ、何もしない', () => {
    expect(sweepUnfinishedWorkspaces(db, roots)).toEqual([])
  })

  it('③ Workspace のフォルダもパーティションもない: 書き直し、missing に入る', () => {
    const a = insertWorkspace(db, { name: 'A', mode: 'custom' }, 1)
    const b = insertWorkspace(db, { name: 'B', mode: 'custom' }, 2)
    // b はフォルダだけ消えた（ログインはパーティションに残っている）ので、① と同じく直すだけ
    mkdirSync(partitionDir(roots, b.id), { recursive: true })
    expect(ensureComManifests(db, roots)).toEqual({
      repaired: [a.id, b.id],
      missing: [a.id],
      failed: []
    })
  })
})

describe('残ったフォルダの片付けと、起動の知らせ', () => {
  const leave = (id: number): void => {
    mkdirSync(workspaceDir(roots, id), { recursive: true })
    mkdirSync(partitionDir(roots, id), { recursive: true })
  }

  it('削除した Workspace の残り（スナップショットがある）は、黙って片付ける', () => {
    skipWorkspaceId(db, 3)
    insertSnapshot(db, 3, { name: 'C', mode: 'custom', tabs: [] }, 1)
    leave(3)
    expect(sweepUnfinishedWorkspaces(db, roots)).toEqual([])
    expect(existsSync(workspaceDir(roots, 3))).toBe(false)
    expect(existsSync(partitionDir(roots, 3))).toBe(false)
  })

  it('確定したことのある番号の残り（DB を戻して一覧から消えた）には触らない', () => {
    skipWorkspaceId(db, 4)
    leave(4)
    expect(sweepUnfinishedWorkspaces(db, roots)).toEqual([])
    expect(existsSync(partitionDir(roots, 4))).toBe(true)
  })

  it('DB を戻した起動では、フォルダを残し、知らせず、その番号を作りかけと見なさなくする', () => {
    const a = insertWorkspace(db, { name: 'A', mode: 'custom' }, 1)
    prepareWorkspaceFiles(roots)(a)
    leave(5) // バックアップの後に作った Workspace（戻した DB にはない）
    expect(collectWorkspaceNotices(db, roots, true)).toEqual([])
    expect(existsSync(partitionDir(roots, 5))).toBe(true)
    expect(lastWorkspaceId(db)).toBe(5)
    // 次の起動でも、作りかけとして知らせず、残す
    expect(collectWorkspaceNotices(db, roots, false)).toEqual([])
    expect(existsSync(partitionDir(roots, 5))).toBe(true)
  })

  it('3パターンを、名前つきで知らせる（直したものと消えたものは分ける）', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((name, i) =>
      insertWorkspace(db, { name, mode: 'custom' }, i)
    )
    for (const w of [a!, b!]) prepareWorkspaceFiles(roots)(w)
    writeFileSync(comManifestPath(roots, a!.id), '{')
    leave(9)
    expect(collectWorkspaceNotices(db, roots, false)).toEqual([
      { kind: 'manifestRepaired', names: ['A'] },
      { kind: 'unfinishedCreate' },
      { kind: 'filesMissing', workspaceId: c!.id, name: 'C' }
    ])
    expect(collectWorkspaceNotices(db, roots, false)).toEqual([])
  })
})
