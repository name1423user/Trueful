import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertWorkspace } from '../../workspace/services/workspaceDB'
import { NEW_TAB_URL } from '../services/tabDB'
import { TabFlows, TabNotFoundError } from './tabFlows'

let db: DatabaseSync
let clock: number
let flows: TabFlows
let ws: number
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
  clock = 1000
  flows = new TabFlows(() => ++clock)
  ws = insertWorkspace(db, { name: 'A', mode: 'custom' }, 0).id
})

const urls = (): string[] => flows.list(db, ws).tabs.map((t) => t.url)
const open = (...names: string[]): number[] =>
  names.map((n) => flows.create(db, ws, `https://${n}.example/`).id)
const names = (): string[] => urls().map((u) => new URL(u).hostname.split('.')[0]!)

describe('タブの作成と選択', () => {
  it('新しいタブは一番右に開き、選択中になる。URL を省くと空のタブ', () => {
    const [a] = open('a')
    const b = flows.create(db, ws)
    expect(urls()).toEqual(['https://a.example/', NEW_TAB_URL])
    expect(flows.list(db, ws).activeId).toBe(b.id)
    flows.activate(db, ws, a!)
    expect(flows.list(db, ws).activeId).toBe(a)
  })

  it('同じ時刻に続けて操作しても、後に選んだタブが選択中になる（時計が戻っても）', () => {
    flows = new TabFlows(() => 5000)
    const [a] = open('a', 'b')
    flows.activate(db, ws, a!)
    expect(flows.list(db, ws).activeId).toBe(a)
    flows = new TabFlows(() => 1)
    const [c] = open('c')
    expect(flows.list(db, ws).activeId).toBe(c)
  })

  it('ないタブ・別の Workspace のタブは選べない', () => {
    const other = insertWorkspace(db, { name: 'B', mode: 'custom' }, 0).id
    const otherTab = flows.create(db, other).id
    expect(() => flows.activate(db, ws, 999)).toThrow(TabNotFoundError)
    expect(() => flows.activate(db, ws, otherTab)).toThrow(TabNotFoundError)
  })

  it('タブは Workspace ごとに分かれる。タブが1つもない Workspace は、一覧を見たときに空のタブを開く', () => {
    const other = insertWorkspace(db, { name: 'B', mode: 'custom' }, 0).id
    open('a')
    expect(urls()).toEqual(['https://a.example/'])
    const state = flows.list(db, other)
    expect(state.tabs.map((t) => t.url)).toEqual([NEW_TAB_URL])
    expect(state.activeId).toBe(state.tabs[0]!.id)
  })
})

describe('タブを閉じる', () => {
  it('選択中のタブを閉じたら、その前に選んでいたタブを選ぶ。ほかのタブを閉じても選択は変わらない', () => {
    const [a, b, c] = open('a', 'b', 'c')
    flows.activate(db, ws, a!)
    flows.activate(db, ws, c!)
    expect(flows.close(db, ws, b!).activeId).toBe(c)
    expect(flows.close(db, ws, c!).activeId).toBe(a)
  })

  it('閉じた後も、並びは左から 0, 1, 2, … のまま', () => {
    const [, b] = open('a', 'b', 'c')
    expect(flows.close(db, ws, b!).tabs.map((t) => t.position)).toEqual([0, 1])
  })

  it('最後の1つを閉じたら、空のタブを1つ開く', () => {
    const [a] = open('a')
    const state = flows.close(db, ws, a!)
    expect(state.tabs.map((t) => t.url)).toEqual([NEW_TAB_URL])
    expect(state.activeId).toBe(state.tabs[0]!.id)
  })

  it('ないタブ・別の Workspace のタブは閉じられない', () => {
    const other = insertWorkspace(db, { name: 'B', mode: 'custom' }, 0).id
    const otherTab = flows.create(db, other).id
    expect(() => flows.close(db, ws, 999)).toThrow(TabNotFoundError)
    expect(() => flows.close(db, ws, otherTab)).toThrow(TabNotFoundError)
    expect(flows.list(db, other).tabs).toHaveLength(1)
  })
})

describe('閉じたタブを戻す', () => {
  it('閉じた順の逆に、元の「左から何番目」へ戻して選ぶ', () => {
    const [, b, c] = open('a', 'b', 'c')
    flows.close(db, ws, b!)
    flows.close(db, ws, c!)
    const reopened = flows.reopenClosed(db, ws)
    expect(reopened).toMatchObject({ url: 'https://c.example/' })
    expect(flows.list(db, ws).activeId).toBe(reopened!.id)
    flows.reopenClosed(db, ws)
    expect(names()).toEqual(['a', 'b', 'c'])
    expect(flows.list(db, ws).tabs.map((t) => t.position)).toEqual([0, 1, 2])
    expect(flows.reopenClosed(db, ws)).toBeUndefined()
  })

  it('番目は閉じたときの並びで数える。閉じた後に開いたタブがあっても、その番目に入れる（足りなければ右端）', () => {
    // a,b,c で a を閉じ（1番目）、c を閉じる（b,c の2番目）。d を開いてから c を戻すと b,c,d
    const [a, , c] = open('a', 'b', 'c')
    flows.close(db, ws, a!)
    flows.close(db, ws, c!)
    open('d')
    flows.reopenClosed(db, ws)
    expect(names()).toEqual(['b', 'c', 'd'])
    flows.reopenClosed(db, ws)
    expect(names()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('タブが減っていたら右端に戻す', () => {
    // 空のタブ2つと c。c（3番目）を閉じた後、空のタブを閉じて1つだけにする（空のタブは控えに積まない）
    const blank1 = flows.create(db, ws).id
    const blank2 = flows.create(db, ws).id
    const [c] = open('c')
    flows.close(db, ws, c!)
    flows.close(db, ws, blank1)
    expect(flows.close(db, ws, blank2).tabs).toHaveLength(1)
    expect(flows.reopenClosed(db, ws)).toMatchObject({ url: 'https://c.example/', position: 1 })
  })

  it('空のタブは控えに積まない', () => {
    const [a] = open('a')
    flows.close(db, ws, a!)
    const blank = flows.list(db, ws).tabs[0]!.id
    flows.create(db, ws)
    flows.close(db, ws, blank)
    expect(flows.reopenClosed(db, ws)).toMatchObject({ url: 'https://a.example/' })
    expect(flows.reopenClosed(db, ws)).toBeUndefined()
  })

  it('戻すのに失敗したら、控えは残る', () => {
    const [a] = open('a')
    flows.close(db, ws, a!)
    db.exec("CREATE TRIGGER fail_tab BEFORE INSERT ON tab BEGIN SELECT RAISE(ABORT, 'boom'); END")
    expect(() => flows.reopenClosed(db, ws)).toThrow('boom')
    db.exec('DROP TRIGGER fail_tab')
    expect(flows.reopenClosed(db, ws)).toMatchObject({ url: 'https://a.example/' })
  })

  it('控えは Workspace ごと。25 個を超えたら古いものから捨てる', () => {
    const other = insertWorkspace(db, { name: 'B', mode: 'custom' }, 0).id
    for (let i = 0; i < 27; i++) {
      flows.close(db, ws, flows.create(db, ws, `https://a.example/${i}`).id)
    }
    expect(flows.reopenClosed(db, other)).toBeUndefined()
    const reopened: string[] = []
    for (let t = flows.reopenClosed(db, ws); t; t = flows.reopenClosed(db, ws)) reopened.push(t.url)
    expect(reopened).toHaveLength(25)
    expect(reopened[0]).toBe('https://a.example/26')
    expect(reopened.at(-1)).toBe('https://a.example/2')
  })
})
