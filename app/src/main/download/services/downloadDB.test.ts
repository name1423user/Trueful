import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertWorkspace } from '../../workspace/services/workspaceDB'
import {
  finishDownload,
  insertDownload,
  interruptUnfinishedDownloads,
  listDownloads,
  updateDownload
} from './downloadDB'

let db: DatabaseSync
let ws: number
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
  ws = insertWorkspace(db, { name: 'A', mode: 'custom' }, 1).id
})

describe('ダウンロードの記録（F07）', () => {
  it('始めると in_progress で記録し、進み具合を更新できる。大きさが分からないときは null', () => {
    const id = insertDownload(
      db,
      { workspaceId: ws, url: 'https://a.example/f.zip', path: '/d/f.zip', totalBytes: null },
      1000
    )
    updateDownload(db, id, { receivedBytes: 500, totalBytes: 2000, state: 'paused' })
    expect(listDownloads(db)[0]).toMatchObject({
      id,
      workspaceId: ws,
      url: 'https://a.example/f.zip',
      path: '/d/f.zip',
      state: 'paused',
      receivedBytes: 500,
      totalBytes: 2000,
      startedTimeMs: 1000,
      endedTimeMs: null
    })
  })

  it('終わったら状態と終了時刻を書く。新しい順に並ぶ', () => {
    const a = insertDownload(
      db,
      { workspaceId: ws, url: 'https://a.example/1', path: '/d/1', totalBytes: 10 },
      1000
    )
    const b = insertDownload(
      db,
      { workspaceId: ws, url: 'https://a.example/2', path: '/d/2', totalBytes: 10 },
      2000
    )
    finishDownload(db, a, 'completed', 3000)
    expect(listDownloads(db).map((d) => [d.id, d.state, d.endedTimeMs])).toEqual([
      [b, 'in_progress', null],
      [a, 'completed', 3000]
    ])
  })

  it('起動時に、終わっていない（in_progress・paused）ものを interrupted にする。終わったものは触らない', () => {
    const a = insertDownload(
      db,
      { workspaceId: ws, url: 'https://a.example/1', path: '/d/1', totalBytes: 10 },
      1000
    )
    const b = insertDownload(
      db,
      { workspaceId: ws, url: 'https://a.example/2', path: '/d/2', totalBytes: 10 },
      1000
    )
    const c = insertDownload(
      db,
      { workspaceId: ws, url: 'https://a.example/3', path: '/d/3', totalBytes: 10 },
      1000
    )
    updateDownload(db, b, { state: 'paused' })
    finishDownload(db, c, 'completed', 2000)
    expect(interruptUnfinishedDownloads(db, 5000)).toBe(2)
    const byId = Object.fromEntries(listDownloads(db).map((d) => [d.id, d]))
    expect(byId[a]).toMatchObject({ state: 'interrupted', endedTimeMs: 5000 })
    expect(byId[b]).toMatchObject({ state: 'interrupted', endedTimeMs: 5000 })
    expect(byId[c]).toMatchObject({ state: 'completed', endedTimeMs: 2000 })
  })

  it('Workspace を指定すると、その Workspace の分だけ。Workspace を消すと記録も消える（ファイルは消さない）', () => {
    const other = insertWorkspace(db, { name: 'B', mode: 'custom' }, 2).id
    insertDownload(
      db,
      { workspaceId: ws, url: 'https://a.example/1', path: '/d/1', totalBytes: 1 },
      1
    )
    insertDownload(
      db,
      { workspaceId: other, url: 'https://a.example/2', path: '/d/2', totalBytes: 1 },
      2
    )
    expect(listDownloads(db, ws)).toHaveLength(1)
    db.prepare('DELETE FROM workspace WHERE id = ?').run(other)
    expect(listDownloads(db)).toHaveLength(1)
  })

  it('不正な状態は DB が拒否する', () => {
    const id = insertDownload(
      db,
      { workspaceId: ws, url: 'https://a.example/1', path: '/d/1', totalBytes: 1 },
      1
    )
    expect(() => updateDownload(db, id, { state: 'weird' as never })).toThrow()
  })
})
