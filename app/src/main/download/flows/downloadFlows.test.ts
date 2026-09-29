import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertWorkspace } from '../../workspace/services/workspaceDB'
import { listDownloads } from '../services/downloadDB'
import { DownloadFlows, type DownloadItemLike } from './downloadFlows'

class FakeItem extends EventEmitter implements DownloadItemLike {
  savePath: string | undefined
  paused = false
  resumable = true
  cancelled = false
  received = 0
  constructor(
    private readonly name: string,
    private readonly total = 1000
  ) {
    super()
  }
  getFilename = (): string => this.name
  getURL = (): string => `https://files.example/${this.name}`
  getReceivedBytes = (): number => this.received
  getTotalBytes = (): number => this.total
  setSavePath = (p: string): void => void (this.savePath = p)
  pause = (): void => void (this.paused = true)
  resume = (): void => void (this.paused = false)
  cancel = (): void => void (this.cancelled = true)
  isPaused = (): boolean => this.paused
  canResume = (): boolean => this.resumable
}

let base: string
let db: DatabaseSync
let ws: number
let time: number
let changes: number
let shown: string[]
let flows: DownloadFlows
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'trueful-dl-'))
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
  ws = insertWorkspace(db, { name: '案件/A', mode: 'custom' }, 1).id
  time = 1000
  changes = 0
  shown = []
  flows = new DownloadFlows({
    getDb: () => db,
    downloadsDir: base,
    notifyChanged: () => void changes++,
    showItemInFolder: (p) => void shown.push(p),
    now: () => time
  })
})
afterEach(() => {
  db.close()
  rmSync(base, { recursive: true, force: true })
})

const norm = (p: string | undefined): string => (p ?? '').replaceAll('\\', '/')

describe('ダウンロードを受ける（F07）', () => {
  it('<Downloads>/Trueful/<Workspace 名（無害化）>/<ファイル名> に保存し、in_progress で記録する', () => {
    const item = new FakeItem('report.pdf')
    flows.handle(ws, item)
    expect(norm(item.savePath)).toBe(`${norm(base)}/Trueful/案件_A/report.pdf`)
    expect(listDownloads(db)[0]).toMatchObject({
      workspaceId: ws,
      state: 'in_progress',
      totalBytes: 1000,
      startedTimeMs: 1000
    })
    expect(changes).toBeGreaterThan(0)
  })

  it('同じ名前を同時に 2 件受けても、別のパスにする（まだファイルがなくても、選んだパスは予約する）', () => {
    const a = new FakeItem('x.zip')
    const b = new FakeItem('x.zip')
    flows.handle(ws, a)
    flows.handle(ws, b)
    expect(norm(a.savePath)).toMatch(/\/x\.zip$/)
    expect(norm(b.savePath)).toMatch(/\/x \(1\)\.zip$/)
  })

  it('サーバーが示した名前のパスの区切りは取り除く。大きさが分からない（0 以下）ときは null', () => {
    const item = new FakeItem('../../evil.exe', 0)
    flows.handle(ws, item)
    expect(norm(item.savePath)).toMatch(/\/案件_A\/evil\.exe$/)
    expect(listDownloads(db)[0]!.totalBytes).toBeNull()
  })

  it('Workspace がない・DB を使えないときは、取り消して記録しない', () => {
    const item = new FakeItem('a.txt')
    flows.handle(9999, item)
    expect(item.cancelled).toBe(true)
    expect(listDownloads(db)).toEqual([])
  })
})

describe('失敗・異常なとき', () => {
  it('記録に失敗したら、予約を戻して取り消す（記録のないファイルを残さない）', () => {
    db.exec('DROP TABLE download')
    const item = new FakeItem('a.txt')
    expect(() => flows.handle(ws, item)).not.toThrow()
    expect(item.cancelled).toBe(true)
  })

  it('保存先のフォルダが、別の場所へのリンクなら、取り消す（リンクの先へ書かせない）', () => {
    const outside = mkdtempSync(join(tmpdir(), 'trueful-dl-outside-'))
    try {
      mkdirSync(join(base, 'Trueful'), { recursive: true })
      symlinkSync(outside, join(base, 'Trueful', '案件_A'), 'junction')
      const item = new FakeItem('a.txt')
      flows.handle(ws, item)
      expect(item.cancelled).toBe(true)
      expect(item.savePath).toBeUndefined()
      expect(listDownloads(db)).toEqual([])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('ネットワークが切れた（interrupted）とき、再開できるなら paused にして知らせる。できないなら done を待つ', () => {
    const a = new FakeItem('a')
    flows.handle(ws, a)
    const before = changes
    a.emit('updated', {}, 'interrupted')
    expect(listDownloads(db)[0]!.state).toBe('paused')
    expect(changes).toBeGreaterThan(before)
    const b = new FakeItem('b')
    b.resumable = false
    flows.handle(ws, b)
    b.emit('updated', {}, 'interrupted')
    expect(listDownloads(db).find((d) => d.url.endsWith('/b'))!.state).toBe('in_progress')
  })

  it('終了のとき（dispose）は、動いているダウンロードをすべて取り消す', () => {
    const a = new FakeItem('a')
    const b = new FakeItem('b')
    flows.handle(ws, a)
    flows.handle(ws, b)
    flows.dispose()
    expect([a.cancelled, b.cancelled]).toEqual([true, true])
  })
})

describe('進み具合と終わり', () => {
  it('進み具合を記録する（書き込みは 500ms に 1 回まで）。終わったら完了と時刻', () => {
    const item = new FakeItem('a.bin')
    flows.handle(ws, item)
    item.received = 100
    item.emit('updated', {}, 'progressing') // 同じ時刻（1000）: 間引く
    expect(listDownloads(db)[0]!.receivedBytes).toBe(0)
    time = 1600
    item.received = 300
    item.emit('updated', {}, 'progressing')
    expect(listDownloads(db)[0]!.receivedBytes).toBe(300)
    time = 1700
    item.received = 1000
    item.emit('done', {}, 'completed')
    expect(listDownloads(db)[0]).toMatchObject({
      state: 'completed',
      receivedBytes: 1000,
      endedTimeMs: 1700
    })
  })

  it('取り消し・失敗で終わったら、cancelled・interrupted と記録する', () => {
    const a = new FakeItem('a')
    const b = new FakeItem('b')
    flows.handle(ws, a)
    flows.handle(ws, b)
    a.emit('done', {}, 'cancelled')
    b.emit('done', {}, 'interrupted')
    const states = Object.fromEntries(
      listDownloads(db).map((d) => [d.url.split('/').pop(), d.state])
    )
    expect(states).toEqual({ a: 'cancelled', b: 'interrupted' })
  })
})

describe('一時停止・再開・取り消し・フォルダで表示', () => {
  it('一時停止すると paused、再開すると in_progress。再開できないものは false', () => {
    const item = new FakeItem('a')
    flows.handle(ws, item)
    const id = listDownloads(db)[0]!.id
    expect(flows.pause(id)).toBe(true)
    expect(item.paused).toBe(true)
    expect(listDownloads(db)[0]!.state).toBe('paused')
    expect(flows.resume(id)).toBe(true)
    expect(listDownloads(db)[0]!.state).toBe('in_progress')
    item.resumable = false
    flows.pause(id)
    expect(flows.resume(id)).toBe(false)
  })

  it('取り消すと、ダウンロードを止める（記録は done の知らせで cancelled になる）', () => {
    const item = new FakeItem('a')
    flows.handle(ws, item)
    const id = listDownloads(db)[0]!.id
    expect(flows.cancel(id)).toBe(true)
    expect(item.cancelled).toBe(true)
  })

  it('動いていない（終わった・再起動で中断した）ものは、一時停止・再開・取り消しできない。ない id も false', () => {
    const item = new FakeItem('a')
    flows.handle(ws, item)
    const id = listDownloads(db)[0]!.id
    item.emit('done', {}, 'completed')
    expect(flows.pause(id)).toBe(false)
    expect(flows.resume(id)).toBe(false)
    expect(flows.cancel(id)).toBe(false)
    expect(flows.pause(9999)).toBe(false)
  })

  it('フォルダで表示は、記録にある保存先を渡す。ない id は false', () => {
    const item = new FakeItem('a.txt')
    flows.handle(ws, item)
    const row = listDownloads(db)[0]!
    expect(flows.showInFolder(row.id)).toBe(false) // ファイルがまだない
    writeFileSync(row.path, 'x')
    expect(flows.showInFolder(row.id)).toBe(true)
    expect(shown).toEqual([row.path])
    expect(flows.showInFolder(9999)).toBe(false)
  })
})
