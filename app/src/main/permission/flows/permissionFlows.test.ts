import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertWorkspace } from '../../workspace/services/workspaceDB'
import { getDecision, setDecision } from '../services/permissionDB'
import { PermissionFlows, type PermissionAnswer } from './permissionFlows'

let db: DatabaseSync
let ws: number
let asked: string[]
let answer: PermissionAnswer
let flows: PermissionFlows
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
  ws = insertWorkspace(db, { name: 'A', mode: 'custom' }, 1).id
  asked = []
  answer = 'dismissed'
  flows = new PermissionFlows({
    getDb: () => db,
    ask: async (_ws, origin, permission) => {
      asked.push(`${origin} ${permission}`)
      return answer
    },
    now: () => 1000
  })
})

const request = (
  permission: string,
  url = 'https://a.example/page',
  details?: { mediaTypes?: string[] }
): Promise<boolean> => flows.request(ws, url, permission, details)

describe('権限の要求（F16）', () => {
  it('記憶した許可はそのまま許可、拒否は拒否。確認は出さない', async () => {
    setDecision(db, ws, 'https://a.example', 'geolocation', 'allow', 1)
    setDecision(db, ws, 'https://a.example', 'notifications', 'deny', 1)
    expect(await request('geolocation')).toBe(true)
    expect(await request('notifications')).toBe(false)
    expect(asked).toEqual([])
  })

  it('決めていなければ確認を出す。許可・拒否の答えは記憶する', async () => {
    answer = 'allow'
    expect(await request('geolocation')).toBe(true)
    expect(getDecision(db, ws, 'https://a.example', 'geolocation')).toBe('allow')
    answer = 'deny'
    expect(await request('notifications')).toBe(false)
    expect(getDecision(db, ws, 'https://a.example', 'notifications')).toBe('deny')
    expect(asked).toEqual(['https://a.example geolocation', 'https://a.example notifications'])
  })

  it('答えが出なかった（画面が閉じた・確認の画面がまだない）ときは、拒否して、記憶しない', async () => {
    answer = 'dismissed'
    expect(await request('geolocation')).toBe(false)
    expect(getDecision(db, ws, 'https://a.example', 'geolocation')).toBeUndefined()
  })

  it('カメラとマイクを同時に求められたら、両方が許可のときだけ許可。1つでも拒否なら、確認せずに拒否', async () => {
    setDecision(db, ws, 'https://a.example', 'camera', 'allow', 1)
    setDecision(db, ws, 'https://a.example', 'microphone', 'deny', 1)
    expect(await request('media', 'https://a.example/', { mediaTypes: ['video', 'audio'] })).toBe(
      false
    )
    expect(asked).toEqual([])
    setDecision(db, ws, 'https://a.example', 'microphone', 'allow', 2)
    expect(await request('media', 'https://a.example/', { mediaTypes: ['video', 'audio'] })).toBe(
      true
    )
  })

  it('確認の対象でない権限（全画面・外部アプリなど）と、http・https でないページは、いつも拒否。確認も出さない', async () => {
    expect(await request('openExternal')).toBe(false)
    expect(await request('geolocation', 'file:///x.html')).toBe(false)
    expect(await request('geolocation', 'about:blank')).toBe(false)
    expect(asked).toEqual([])
  })

  it('DB を使えないときは拒否する（同期の確認 check も、決めた許可だけが true）', async () => {
    setDecision(db, ws, 'https://a.example', 'geolocation', 'allow', 1)
    expect(flows.check(ws, 'https://a.example', 'geolocation')).toBe(true)
    expect(flows.check(ws, 'https://a.example', 'notifications')).toBe(false)
    expect(flows.check(ws, 'https://a.example', 'openExternal')).toBe(false)
    const closed = new PermissionFlows({ getDb: () => undefined, ask: async () => 'allow' })
    expect(await closed.request(ws, 'https://a.example', 'geolocation')).toBe(false)
    expect(closed.check(ws, 'https://a.example', 'geolocation')).toBe(false)
  })
})
