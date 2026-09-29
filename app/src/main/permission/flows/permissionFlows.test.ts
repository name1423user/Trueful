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
  details?: { mediaTypes?: string[]; isMainFrame?: boolean; topLevelUrl?: string }
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

describe('サブフレーム・競合・後始末', () => {
  it('iframe（サブフレーム）の要求は、許可済みのサイトでも拒否する。確認も出さない（埋め込みが、別のサイトの許可を借りない）', async () => {
    setDecision(db, ws, 'https://a.example', 'geolocation', 'allow', 1)
    expect(await request('geolocation', 'https://a.example/x', { isMainFrame: false })).toBe(false)
    expect(await request('geolocation', 'https://a.example/x', { isMainFrame: true })).toBe(true)
    expect(asked).toEqual([])
  })

  it('メインフレームの要求元 URL が、今のページの origin と違ったら拒否する（古い URL の要求）', async () => {
    setDecision(db, ws, 'https://a.example', 'geolocation', 'allow', 1)
    expect(
      await request('geolocation', 'https://a.example/', {
        isMainFrame: true,
        topLevelUrl: 'https://evil.example/'
      })
    ).toBe(false)
    expect(
      await request('geolocation', 'https://a.example/', {
        isMainFrame: true,
        topLevelUrl: 'https://a.example/other'
      })
    ).toBe(true)
  })

  it('同じ権限の確認が同時に来ても、確認は1回。答えは全員に同じ。確認の間に決まっていたら、それに従う', async () => {
    let release: (a: PermissionAnswer) => void = () => {}
    const slow = new PermissionFlows({
      getDb: () => db,
      ask: (_w, o, p) => {
        asked.push(`${o} ${p}`)
        return new Promise<PermissionAnswer>((resolve) => (release = resolve))
      },
      now: () => 1000
    })
    const a = slow.request(ws, 'https://a.example/', 'geolocation')
    const b = slow.request(ws, 'https://a.example/', 'geolocation')
    await Promise.resolve()
    release('allow')
    expect(await Promise.all([a, b])).toEqual([true, true])
    expect(asked).toEqual(['https://a.example geolocation'])
  })

  it('確認の間に、Workspace がなくなった・DB が閉じたときは、拒否して、記憶しない（例外にしない）', async () => {
    const gone = new PermissionFlows({
      getDb: () => db,
      ask: async () => {
        db.prepare('DELETE FROM workspace WHERE id = ?').run(ws)
        return 'allow'
      }
    })
    expect(await gone.request(ws, 'https://a.example/', 'geolocation')).toBe(false)
    expect(getDecision(db, ws, 'https://a.example', 'geolocation')).toBeUndefined()
  })

  it('Workspace を閉じたとき（dismissWorkspace）は、確認中のものを「答えなし」にする', async () => {
    const pending = new PermissionFlows({
      getDb: () => db,
      ask: (_w, _o, _p, signal) =>
        new Promise<PermissionAnswer>((resolve) =>
          signal.addEventListener('abort', () => resolve('dismissed'))
        )
    })
    const result = pending.request(ws, 'https://a.example/', 'geolocation')
    await Promise.resolve()
    pending.dismissWorkspace(ws)
    expect(await result).toBe(false)
  })

  it('同期の確認: media の種類が分からない（unknown）ときは、カメラかマイクのどちらかが許可なら true', () => {
    setDecision(db, ws, 'https://a.example', 'camera', 'allow', 1)
    expect(flows.check(ws, 'https://a.example', 'media')).toBe(true)
    expect(flows.check(ws, 'https://a.example', 'media', { mediaTypes: ['audio'] })).toBe(false)
    expect(flows.check(ws, 'https://a.example', 'media', { mediaTypes: ['video'] })).toBe(true)
  })
})
