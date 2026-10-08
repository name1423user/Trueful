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

describe('その場の答え（候補の先頭）', () => {
  const answerContext = { now: Date.UTC(2026, 9, 9), uuid: () => 'u' }
  it('答えは「開く」より前に出し、その後ろに通常の候補と Web 検索が続く', () => {
    const list = suggest(db, { query: '1+2', workspaceId: a, answerContext })
    expect(list[0]).toEqual({ kind: 'answer', title: '3', answerKind: 'calc' })
    expect(list.at(-1)?.kind).toBe('search')
  })
  it('色には detail と color が付く', () => {
    expect(suggest(db, { query: '#f80', workspaceId: a, answerContext })[0]).toEqual({
      kind: 'answer',
      title: '#ff8800',
      answerKind: 'color',
      detail: 'rgb(255, 136, 0)',
      color: '#ff8800'
    })
  })
  it('答えのない入力には、答えの候補を出さない', () => {
    expect(kinds('react hooks')).toEqual(['search'])
  })
})

describe('今の Workspace と他の Workspace（レビューの指摘）', () => {
  it('同じ URL が他の Workspace にもあっても、今の Workspace のタブを出す（他の Workspace のものにしない）', () => {
    insertTab(db, { workspaceId: a, url: 'https://react.dev/x', title: 'X' }, 10)
    insertTab(db, { workspaceId: b, url: 'https://react.dev/x', title: 'X' }, 99) // こちらが新しい
    const tabs = suggest(db, { query: 'react.dev/x', workspaceId: a }).filter(
      (c) => c.kind === 'tab'
    )
    expect(tabs).toHaveLength(1)
    expect(tabs[0]).toMatchObject({ workspaceId: a })
    expect(tabs[0]?.otherWorkspace).toBeUndefined()
  })

  it('他の Workspace に新しいヒットが20件以上あっても、今の Workspace の候補は出る', () => {
    insertTab(db, { workspaceId: a, url: 'https://react.dev/mine', title: 'mine' }, 1)
    recordVisit(db, { workspaceId: a, url: 'https://react.dev/history', title: 'h', now: 1 })
    for (let i = 0; i < 60; i++) {
      insertTab(db, { workspaceId: b, url: `https://react.dev/b${i}`, title: 'b' }, 100 + i)
      recordVisit(db, {
        workspaceId: b,
        url: `https://react.dev/bh${i}`,
        title: 'bh',
        now: 100 + i
      })
    }
    const list = suggest(db, { query: 'react.dev', workspaceId: a })
    expect(list.filter((c) => c.kind === 'tab' && !c.otherWorkspace)).toHaveLength(1)
    expect(list.filter((c) => c.kind === 'history' && !c.otherWorkspace)).toHaveLength(1)
  })

  it('今の Workspace に新しいヒットが50件以上あっても、他の Workspace の候補は出る', () => {
    for (let i = 0; i < 60; i++) {
      insertTab(db, { workspaceId: a, url: `https://react.dev/a${i}`, title: 'a' }, 100 + i)
      recordVisit(db, {
        workspaceId: a,
        url: `https://react.dev/ah${i}`,
        title: 'ah',
        now: 100 + i
      })
    }
    insertTab(db, { workspaceId: b, url: 'https://react.dev/b-tab', title: 'b' }, 1)
    recordVisit(db, { workspaceId: b, url: 'https://react.dev/b-history', title: 'bh', now: 1 })
    const others = suggest(db, { query: 'react.dev', workspaceId: a }).filter(
      (c) => c.otherWorkspace
    )
    expect(others.map((c) => c.kind).sort()).toEqual(['history', 'tab'])
  })

  it('打った URL と同じ URL のタブが他の Workspace にだけあるときも、切り替える候補として出す', () => {
    insertTab(db, { workspaceId: b, url: 'https://react.dev/', title: 'React' }, 1)
    const list = suggest(db, { query: 'react.dev', workspaceId: a })
    expect(list.map((c) => c.kind)).toEqual(['url', 'tab', 'search'])
    expect(list[1]).toMatchObject({ kind: 'tab', workspaceId: b, otherWorkspace: true })
  })

  it('今の Workspace が多くても、他の Workspace の候補の枠は残る（合わせて 8 件まで）', () => {
    for (let i = 0; i < 5; i++) {
      insertTab(db, { workspaceId: a, url: `https://react.dev/t${i}`, title: 't' }, i)
      recordVisit(db, { workspaceId: a, url: `https://react.dev/h${i}`, title: 'h', now: i })
      insertBookmark(db, { kind: 'url', title: 'bk', url: `https://react.dev/k${i}` }, i)
    }
    insertTab(db, { workspaceId: b, url: 'https://react.dev/other', title: 'other' }, 500)
    const list = suggest(db, { query: 'react.dev', workspaceId: a }).filter(
      (c) => c.kind !== 'url' && c.kind !== 'search'
    )
    expect(list.length).toBeLessThanOrEqual(8)
    expect(list.some((c) => c.otherWorkspace && c.mode === 'production')).toBe(true)
  })

  it('ブックマークは、タブとまとめたあとで足りない分を補う', () => {
    for (let i = 0; i < 3; i++) {
      insertTab(db, { workspaceId: a, url: `https://react.dev/k${i}`, title: 'tab' }, i)
      insertBookmark(db, { kind: 'url', title: 'bk', url: `https://react.dev/k${i}` }, 10 + i)
    }
    insertBookmark(db, { kind: 'url', title: 'bk', url: 'https://react.dev/other1' }, 1)
    insertBookmark(db, { kind: 'url', title: 'bk', url: 'https://react.dev/other2' }, 2)
    const bookmarks = suggest(db, { query: 'react.dev', workspaceId: a }).filter(
      (c) => c.kind === 'bookmark'
    )
    expect(bookmarks.map((c) => c.url).sort()).toEqual([
      'https://react.dev/other1',
      'https://react.dev/other2'
    ])
  })

  it('Workspace が決まっていない（null）ときは、タブと履歴はすべて他の Workspace として出す', () => {
    insertTab(db, { workspaceId: a, url: 'https://react.dev/t', title: 't' }, 1)
    const list = suggest(db, { query: 'react.dev', workspaceId: null })
    expect(list.find((c) => c.kind === 'tab')).toMatchObject({
      otherWorkspace: true,
      mode: 'development'
    })
  })

  it('「?」で始まる入力は、「?」を除いて探し、Web 検索の見出しにも「?」を出さない', () => {
    insertTab(db, { workspaceId: a, url: 'https://react.dev/', title: 'React' }, 1)
    const list = suggest(db, { query: '?react', workspaceId: a })
    expect(list.map((c) => c.kind)).toEqual(['tab', 'workspace', 'search']) // workspace は「React 本番」
    expect(list.at(-1)).toMatchObject({ title: 'react' })
    expect(suggest(db, { query: '?', workspaceId: a })).toEqual([])
  })
})

describe('履歴 10 万件で 16ms 以内（F10 の性能予算、data-schema の「履歴の検索」）', () => {
  it('3文字以上のよくある語・まれな語と、2文字でヒットなしの検索', () => {
    const insert = db.prepare(
      'INSERT INTO history_url (workspace_id, url, title, visit_count, last_visited_time_ms) VALUES (?, ?, ?, 1, ?)'
    )
    db.exec('BEGIN')
    for (let i = 0; i < 100_000; i++) {
      insert.run(i % 2 ? a : b, `https://react.dev/page/${i}`, `React ページ ${i}`, i)
    }
    db.exec('COMMIT')
    // タブ・ブックマークも置く（候補の組み立ては、3種類を合わせて測る）
    for (let i = 0; i < 2000; i++) {
      insertTab(
        db,
        { workspaceId: i % 2 ? a : b, url: `https://react.dev/tab/${i}`, title: `T${i}` },
        i
      )
      insertBookmark(db, { kind: 'url', title: `B${i}`, url: `https://react.dev/bm/${i}` }, i)
    }
    // 1回ならし、7回の中央値で測る
    const median = (query: string): number => {
      suggest(db, { query, workspaceId: a })
      const times: number[] = []
      for (let i = 0; i < 7; i++) {
        const start = performance.now()
        suggest(db, { query, workspaceId: a })
        times.push(performance.now() - start)
      }
      return times.sort((x, y) => x - y)[3]!
    }
    expect(median('react')).toBeLessThan(16) // ほぼ全件にヒット
    expect(median('page/99999')).toBeLessThan(16) // 10 万件に1件
    expect(median('zq')).toBeLessThan(16) // 2文字でヒットなし
  }, 60_000) // 10 万件の準備に、CI では 5 秒以上かかる
})
