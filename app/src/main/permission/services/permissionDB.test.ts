import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertWorkspace } from '../../workspace/services/workspaceDB'
import { getDecision, listPermissions, revokePermission, setDecision } from './permissionDB'

let db: DatabaseSync
let ws1: number
let ws2: number
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
  ws1 = insertWorkspace(db, { name: 'A', mode: 'custom' }, 1).id
  ws2 = insertWorkspace(db, { name: 'B', mode: 'custom' }, 2).id
})

describe('サイトの権限の記憶（F16）', () => {
  it('Workspace とサイトと権限の組ごとに、許可・拒否を記憶する。決めていないものは undefined', () => {
    expect(getDecision(db, ws1, 'https://a.example', 'camera')).toBeUndefined()
    setDecision(db, ws1, 'https://a.example', 'camera', 'allow', 1000)
    expect(getDecision(db, ws1, 'https://a.example', 'camera')).toBe('allow')
    // 別の Workspace・別のサイト・別の権限には効かない
    expect(getDecision(db, ws2, 'https://a.example', 'camera')).toBeUndefined()
    expect(getDecision(db, ws1, 'https://b.example', 'camera')).toBeUndefined()
    expect(getDecision(db, ws1, 'https://a.example', 'microphone')).toBeUndefined()
  })

  it('決め直すと上書きする（1 組に 1 行）', () => {
    setDecision(db, ws1, 'https://a.example', 'camera', 'allow', 1000)
    setDecision(db, ws1, 'https://a.example', 'camera', 'deny', 2000)
    expect(getDecision(db, ws1, 'https://a.example', 'camera')).toBe('deny')
    expect(listPermissions(db)).toEqual([
      {
        workspaceId: ws1,
        origin: 'https://a.example',
        permission: 'camera',
        decision: 'deny',
        decidedTimeMs: 2000
      }
    ])
  })

  it('取り消すと、また未決になる（次に要求されたら、確認する）。ない組は false', () => {
    setDecision(db, ws1, 'https://a.example', 'camera', 'allow', 1000)
    expect(revokePermission(db, ws1, 'https://a.example', 'camera')).toBe(true)
    expect(getDecision(db, ws1, 'https://a.example', 'camera')).toBeUndefined()
    expect(revokePermission(db, ws1, 'https://a.example', 'camera')).toBe(false)
  })

  it('一覧は Workspace で絞れる。Workspace を消すと記憶も消える', () => {
    setDecision(db, ws1, 'https://a.example', 'camera', 'allow', 1)
    setDecision(db, ws2, 'https://a.example', 'camera', 'deny', 2)
    expect(listPermissions(db, ws1)).toHaveLength(1)
    db.prepare('DELETE FROM workspace WHERE id = ?').run(ws2)
    expect(listPermissions(db)).toHaveLength(1)
  })

  it('知らない権限は DB が拒否する', () => {
    expect(() => setDecision(db, ws1, 'https://a.example', 'usb' as never, 'allow', 1)).toThrow()
  })
})
