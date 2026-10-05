import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertTab } from '../../tab/services/tabDB'
import { insertWorkspace } from './workspaceDB'
import {
  buildSnapshot,
  insertSnapshot,
  purgeExpiredSnapshots,
  SNAPSHOT_KEEP_MS
} from './workspaceSnapshot'

let db: DatabaseSync
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
})

const DAY = 24 * 60 * 60 * 1000
const count = (): number =>
  Number(db.prepare('SELECT count(*) c FROM workspace_snapshot').get()?.['c'])

describe('削除前のスナップショット（F01）', () => {
  it('名前・Mode・タブの URL とタイトルだけを入れる（Cookie やストレージは入れない）', () => {
    const w = insertWorkspace(db, { name: '案件A', mode: 'production' }, 1000)
    const tab = insertTab(db, { workspaceId: w.id, url: 'https://example.com/' }, 1000)
    db.prepare("UPDATE tab SET title = 'Example' WHERE id = ?").run(tab.id)
    const snapshot = buildSnapshot(db, w.id)
    expect(snapshot).toEqual({
      name: '案件A',
      mode: 'production',
      tabs: [{ url: 'https://example.com/', title: 'Example' }]
    })
  })

  it('保存すると、Workspace を消した後も残る（外部キーなし）', () => {
    const w = insertWorkspace(db, { name: 'A', mode: 'custom' }, 1000)
    insertSnapshot(db, w.id, buildSnapshot(db, w.id), 5000)
    db.prepare('DELETE FROM workspace WHERE id = ?').run(w.id)
    expect(
      db.prepare('SELECT workspace_id, created_time_ms FROM workspace_snapshot').all()
    ).toEqual([{ workspace_id: w.id, created_time_ms: 5000 }])
  })

  it('30 日で消す。29 日は残し、30 日ちょうどから消す（起動時）', () => {
    expect(SNAPSHOT_KEEP_MS).toBe(30 * DAY)
    const now = 100 * DAY
    for (const age of [29, 30, 31]) {
      db.prepare(
        "INSERT INTO workspace_snapshot (workspace_id, snapshot_json, created_time_ms) VALUES (1, '{}', ?)"
      ).run(now - age * DAY)
    }
    expect(purgeExpiredSnapshots(db, now)).toBe(2)
    expect(count()).toBe(1)
  })
})
