import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertWorkspace } from '../../workspace/services/workspaceDB'
import { NEW_TAB_URL } from '../services/tabDB'
import { getTabState, TabFlows, TabNotFoundError } from './tabFlows'

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

const urls = (): string[] => getTabState(db, ws).tabs.map((t) => t.url)

describe('タブの作成と選択', () => {
  it('新しいタブは一番右に開き、選択中になる。URL を省くと空のタブ', () => {
    const a = flows.create(db, ws, 'https://a.example/')
    const b = flows.create(db, ws)
    expect(urls()).toEqual(['https://a.example/', NEW_TAB_URL])
    expect(getTabState(db, ws).activeId).toBe(b.id)
    flows.activate(db, a.id)
    expect(getTabState(db, ws).activeId).toBe(a.id)
  })

  it('ないタブは選べない', () => {
    expect(() => flows.activate(db, 999)).toThrow(TabNotFoundError)
  })

  it('タブは Workspace ごとに分かれる', () => {
    const other = insertWorkspace(db, { name: 'B', mode: 'custom' }, 0).id
    flows.create(db, ws, 'https://a.example/')
    flows.create(db, other, 'https://b.example/')
    expect(urls()).toEqual(['https://a.example/'])
    expect(getTabState(db, other).tabs.map((t) => t.url)).toEqual(['https://b.example/'])
  })
})

describe('タブを閉じる・閉じたタブを戻す', () => {
  it('選択中のタブを閉じたら、その前に選んでいたタブを選ぶ', () => {
    const a = flows.create(db, ws, 'https://a.example/')
    flows.create(db, ws, 'https://b.example/')
    const c = flows.create(db, ws, 'https://c.example/')
    flows.activate(db, a.id)
    flows.activate(db, c.id)
    expect(flows.close(db, c.id).activeId).toBe(a.id)
  })

  it('最後の1つを閉じたら、空のタブを1つ開く', () => {
    const a = flows.create(db, ws, 'https://a.example/')
    const state = flows.close(db, a.id)
    expect(state.tabs.map((t) => t.url)).toEqual([NEW_TAB_URL])
    expect(state.activeId).toBe(state.tabs[0]!.id)
  })

  it('閉じたタブを、閉じた順の逆に、元の位置へ戻す', () => {
    flows.create(db, ws, 'https://a.example/')
    const b = flows.create(db, ws, 'https://b.example/')
    const c = flows.create(db, ws, 'https://c.example/')
    flows.close(db, b.id)
    flows.close(db, c.id)
    const reopened = flows.reopenClosed(db, ws)
    expect(reopened).toMatchObject({ url: 'https://c.example/' })
    expect(getTabState(db, ws).activeId).toBe(reopened!.id)
    flows.reopenClosed(db, ws)
    expect(urls()).toEqual(['https://a.example/', 'https://b.example/', 'https://c.example/'])
    expect(flows.reopenClosed(db, ws)).toBeUndefined()
  })

  it('閉じたタブの控えは Workspace ごと。25 個を超えたら古いものから捨てる', () => {
    const other = insertWorkspace(db, { name: 'B', mode: 'custom' }, 0).id
    for (let i = 0; i < 27; i++) {
      flows.close(db, flows.create(db, ws, `https://a.example/${i}`).id)
    }
    expect(flows.reopenClosed(db, other)).toBeUndefined()
    const reopened: string[] = []
    for (let t = flows.reopenClosed(db, ws); t; t = flows.reopenClosed(db, ws)) reopened.push(t.url)
    expect(reopened).toHaveLength(25)
    expect(reopened[0]).toBe('https://a.example/26')
    expect(reopened.at(-1)).toBe('https://a.example/2')
  })

  it('ないタブは閉じられない', () => {
    expect(() => flows.close(db, 999)).toThrow(TabNotFoundError)
  })
})
