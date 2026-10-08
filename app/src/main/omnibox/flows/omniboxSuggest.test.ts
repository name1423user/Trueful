import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { insertBookmark } from '../../bookmark/services/bookmarkDB'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { recordVisit } from '../../history/services/historyDB'
import { insertTab } from '../../tab/services/tabDB'
import { insertWorkspace } from '../../workspace/services/workspaceDB'
import { suggest } from './omniboxSuggest'

let db: DatabaseSync
let a: number
let b: number
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
  a = insertWorkspace(db, { name: '案件A', mode: 'development' }, 1).id
  b = insertWorkspace(db, { name: 'React 本番', mode: 'production' }, 1).id
})

const kinds = (query: string, workspaceId = a): string[] =>
  suggest(db, { query, workspaceId }).map((c) => c.kind)

describe('統合検索欄の候補（F10）', () => {
  it('空の入力は候補なし', () => {
    expect(suggest(db, { query: '  ', workspaceId: a })).toEqual([])
  })

  it('URL らしい入力は、先頭に「開く」、最後に Web 検索', () => {
    const list = suggest(db, { query: 'example.com', workspaceId: a })
    expect(list[0]).toMatchObject({ kind: 'url', url: 'https://example.com/' })
    expect(list.at(-1)).toMatchObject({ kind: 'search', title: 'example.com' })
  })

  it('URL でない入力は、Web 検索だけ（「開く」は出さない）', () => {
    expect(kinds('react hooks')).toEqual(['search'])
  })

  it('近道（数字だけ → localhost）は「開く」として先頭に出す', () => {
    expect(suggest(db, { query: '5173', workspaceId: a })[0]).toMatchObject({
      kind: 'url',
      url: 'http://localhost:5173/'
    })
  })

  it('並び: 今の Workspace のタブ → 履歴 → ブックマーク → 他の Workspace（Mode 付き）→ Web 検索', () => {
    insertTab(db, { workspaceId: a, url: 'https://react.dev/learn', title: 'React 入門' }, 10)
    recordVisit(db, {
      workspaceId: a,
      url: 'https://react.dev/reference',
      title: 'React の API',
      now: 20
    })
    insertBookmark(db, { kind: 'url', title: 'React ブログ', url: 'https://react.dev/blog' }, 30)
    insertTab(db, { workspaceId: b, url: 'https://react.dev/b', title: 'React（本番）' }, 40)
    const list = suggest(db, { query: 'react', workspaceId: a })
    expect(list.map((c) => c.kind)).toEqual([
      'tab',
      'history',
      'bookmark',
      'workspace',
      'tab',
      'search'
    ])
    // 他の Workspace の候補には、その Workspace の id と Mode が付く
    expect(list[3]).toMatchObject({ kind: 'workspace', workspaceId: b, mode: 'production' })
    expect(list[4]).toMatchObject({
      kind: 'tab',
      workspaceId: b,
      mode: 'production',
      otherWorkspace: true
    })
  })

  it('同じ URL は1つにまとめる（タブ > ブックマーク > 履歴）', () => {
    insertTab(db, { workspaceId: a, url: 'https://react.dev/hooks', title: 'Hooks' }, 10)
    recordVisit(db, { workspaceId: a, url: 'https://react.dev/hooks', title: 'Hooks', now: 20 })
    insertBookmark(db, { kind: 'url', title: 'Hooks', url: 'https://react.dev/hooks' }, 30)
    expect(kinds('hooks')).toEqual(['tab', 'search'])
  })

  it('URL らしい入力と同じ URL の履歴は「開く」にまとめる。開いているタブは残す（切り替えられるように）', () => {
    insertTab(db, { workspaceId: a, url: 'https://react.dev/', title: 'React' }, 10)
    recordVisit(db, { workspaceId: a, url: 'https://react.dev/', title: 'React', now: 20 })
    expect(kinds('react.dev')).toEqual(['url', 'tab', 'search'])
  })

  it('空のタブ（about:blank）は候補にしない', () => {
    insertTab(db, { workspaceId: a, url: 'about:blank', title: '新しいタブ' }, 10)
    expect(kinds('新しい')).toEqual(['search'])
  })

  it('件数は種類ごとに上限がある（合わせて 8 件まで ＋ Web 検索）', () => {
    for (let i = 0; i < 20; i++) {
      recordVisit(db, {
        workspaceId: a,
        url: `https://react.dev/p${i}`,
        title: `React ${i}`,
        now: i
      })
    }
    const list = suggest(db, { query: 'react', workspaceId: a })
    expect(list.filter((c) => c.kind !== 'search').length).toBeLessThanOrEqual(8)
    expect(list.at(-1)?.kind).toBe('search')
  })
})

describe('履歴 10 万件で 16ms 以内（F10 の性能予算、data-schema の「履歴の検索」）', () => {
  it('3文字以上のよくある語と、2文字でヒットなしの検索', () => {
    const insert = db.prepare(
      'INSERT INTO history_url (workspace_id, url, title, visit_count, last_visited_time_ms) VALUES (?, ?, ?, 1, ?)'
    )
    db.exec('BEGIN')
    for (let i = 0; i < 100_000; i++) {
      insert.run(i % 2 ? a : b, `https://react.dev/page/${i}`, `React ページ ${i}`, i)
    }
    db.exec('COMMIT')
    const best = (query: string): number => {
      const times: number[] = []
      for (let i = 0; i < 7; i++) {
        const start = performance.now()
        suggest(db, { query, workspaceId: a })
        times.push(performance.now() - start)
      }
      return times.sort((x, y) => x - y)[4]!
    }
    expect(best('react')).toBeLessThan(16)
    expect(best('zq')).toBeLessThan(16)
  })
})
