import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertWorkspace } from '../../workspace/services/workspaceDB'
import {
  deleteHistory,
  purgeExpiredHistory,
  recordVisit,
  searchHistory,
  updateHistoryTitle
} from './historyDB'

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

const DAY = 24 * 60 * 60 * 1000
const rows = (): { url: string; visit_count: number; last: number }[] =>
  db
    .prepare('SELECT url, visit_count, last_visited_time_ms last FROM history_url ORDER BY id')
    .all() as never
const visits = (): number => Number(db.prepare('SELECT count(*) c FROM history_visit').get()?.['c'])

describe('訪問の記録（F09）', () => {
  it('URL・題名・時刻・Workspace を保存する。同じ URL は行を増やさず、回数と最後の時刻・題名を更新', () => {
    recordVisit(db, { workspaceId: ws1, url: 'https://a.example/', title: '最初', now: 1000 })
    recordVisit(db, { workspaceId: ws1, url: 'https://a.example/', title: '次', now: 2000 })
    expect(rows()).toEqual([{ url: 'https://a.example/', visit_count: 2, last: 2000 }])
    expect(visits()).toBe(2)
    expect(searchHistory(db, { query: 'a.example' })[0]).toMatchObject({ title: '次' })
  })

  it('Workspace が違えば別の行。about:blank などは記録しない', () => {
    recordVisit(db, { workspaceId: ws1, url: 'https://a.example/', title: '', now: 1 })
    recordVisit(db, { workspaceId: ws2, url: 'https://a.example/', title: '', now: 2 })
    recordVisit(db, { workspaceId: ws1, url: 'about:blank', title: '', now: 3 })
    recordVisit(db, { workspaceId: ws1, url: 'file:///etc/passwd', title: '', now: 4 })
    expect(rows()).toHaveLength(2)
  })

  it('題名は、あとから決まったら更新できる（空では上書きしない）', () => {
    recordVisit(db, { workspaceId: ws1, url: 'https://a.example/', title: '', now: 1 })
    updateHistoryTitle(db, ws1, 'https://a.example/', 'できた題名')
    updateHistoryTitle(db, ws1, 'https://a.example/', '')
    expect(searchHistory(db, { query: 'できた' })).toHaveLength(1)
  })
})

describe('検索（F09・F10）', () => {
  beforeEach(() => {
    recordVisit(db, {
      workspaceId: ws1,
      url: 'https://docs.example/react',
      title: 'React 入門',
      now: 1000
    })
    recordVisit(db, {
      workspaceId: ws1,
      url: 'https://docs.example/vue',
      title: 'Vue ガイド',
      now: 3000
    })
    recordVisit(db, {
      workspaceId: ws2,
      url: 'https://blog.example/react-tips',
      title: 'Tips',
      now: 2000
    })
  })

  it('タイトルと URL の部分一致（3文字以上は全文検索、大文字小文字は区別しない）。新しい順', () => {
    expect(searchHistory(db, { query: 'REACT' }).map((r) => r.url)).toEqual([
      'https://blog.example/react-tips',
      'https://docs.example/react'
    ])
    expect(searchHistory(db, { query: '入門' })).toHaveLength(1) // 2文字（日本語）
    expect(searchHistory(db, { query: 'ガイド' }).map((r) => r.title)).toEqual(['Vue ガイド'])
  })

  it('2文字以下は LIKE。% や _ はそのままの文字として探す', () => {
    expect(searchHistory(db, { query: 'vu' })).toHaveLength(1)
    expect(searchHistory(db, { query: '%' })).toEqual([])
    expect(searchHistory(db, { query: '_' })).toEqual([])
  })

  it('全文検索の記号（" や *）が入っても壊れない。空の入力は空', () => {
    expect(() => searchHistory(db, { query: '"react" OR *' })).not.toThrow()
    expect(searchHistory(db, { query: '   ' })).toEqual([])
  })

  it('Workspace を指定すると、その Workspace だけ。件数の上限も効く', () => {
    expect(searchHistory(db, { query: 'example', workspaceId: ws2 })).toHaveLength(1)
    expect(searchHistory(db, { query: 'example', limit: 2 })).toHaveLength(2)
  })
})

describe('削除と保存期間（F09）', () => {
  beforeEach(() => {
    recordVisit(db, { workspaceId: ws1, url: 'https://old.example/', title: '', now: 9 * DAY })
    recordVisit(db, { workspaceId: ws1, url: 'https://mix.example/', title: '', now: 9 * DAY })
    recordVisit(db, { workspaceId: ws1, url: 'https://mix.example/', title: '', now: 50 * DAY })
    recordVisit(db, { workspaceId: ws1, url: 'https://new.example/', title: '', now: 90 * DAY })
  })

  it('期間を指定して消す。訪問が残る URL は、回数と最後の時刻を数え直す。訪問がなくなった URL は消える', () => {
    deleteHistory(db, { fromMs: 0, toMs: 20 * DAY })
    expect(rows().map((r) => [r.url, r.visit_count, r.last])).toEqual([
      ['https://mix.example/', 1, 50 * DAY],
      ['https://new.example/', 1, 90 * DAY]
    ])
    expect(visits()).toBe(2)
    expect(searchHistory(db, { query: 'old.example' })).toEqual([]) // 全文検索の索引も消える
  })

  it('期間を指定しなければ全部消える', () => {
    deleteHistory(db, {})
    expect(rows()).toEqual([])
    expect(visits()).toBe(0)
  })

  it('保存期間（日数）を過ぎたものだけ消す。ちょうど期間の分は残す', () => {
    const now = 100 * DAY
    expect(purgeExpiredHistory(db, now, 90)).toBe(2) // 9 日の 2 件（90 日前は 10 日）
    expect(rows().map((r) => r.url)).toEqual(['https://mix.example/', 'https://new.example/'])
    expect(purgeExpiredHistory(db, now, 50)).toBe(0) // 50 日ちょうど（now - 50日 = 50日）は残る
    expect(rows()).toHaveLength(2)
  })

  it('Workspace を消すと、その履歴も消える（外部キー）', () => {
    db.prepare('DELETE FROM workspace WHERE id = ?').run(ws1)
    expect(rows()).toEqual([])
    expect(visits()).toBe(0)
  })
})

describe('10 万件での検索は 16ms 以内（F09、SPEC の性能予算）', () => {
  it('3文字以上・2文字以下のどちらも、最速の 5 回のうち最も遅くない値で 16ms 以内', () => {
    db.exec('BEGIN')
    const insertUrl = db.prepare(
      'INSERT INTO history_url (workspace_id, url, title, visit_count, last_visited_time_ms) VALUES (?, ?, ?, 1, ?)'
    )
    for (let i = 0; i < 100_000; i++) {
      insertUrl.run(
        i % 2 === 0 ? ws1 : ws2,
        `https://site${i % 500}.example/page/${i}`,
        `記事 ${i} react vue ${i % 97}`,
        i
      )
    }
    db.exec('COMMIT')
    const best = (query: string): number => {
      const times: number[] = []
      for (let i = 0; i < 5; i++) {
        const t = performance.now()
        searchHistory(db, { query, workspaceId: ws1, limit: 20 })
        times.push(performance.now() - t)
      }
      return Math.min(...times)
    }
    expect(best('react')).toBeLessThan(16)
    expect(best('page/9')).toBeLessThan(16)
    expect(best('re')).toBeLessThan(16)
  })
})
