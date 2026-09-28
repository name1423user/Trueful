import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { insertWorkspace, setCurrentWorkspaceId } from '../../workspace/services/workspaceDB'
import { getTab } from '../services/tabDB'
import type { PageState, TabViews } from '../services/tabViews'
import { TabFlows, TabNotFoundError } from './tabFlows'
import { TabPages } from './tabPages'

let db: DatabaseSync
let tabs: TabFlows
let ws: number
// TabViews の代わり（Electron なしで確かめる）。ページがあるタブの id と、読み込んだ URL を覚える
const loaded: string[] = []
const shown: number[] = []
let withPage = new Set<number>()
const views = {
  show: (tab: { id: number }) => shown.push(tab.id),
  webContents: (id: number) =>
    withPage.has(id) ? { loadURL: async (url: string) => void loaded.push(url) } : undefined
} as unknown as TabViews
const notify = { page: vi.fn() }
let pages: TabPages

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
  tabs = new TabFlows()
  ws = insertWorkspace(db, { name: 'A', mode: 'custom' }, 0).id
  setCurrentWorkspaceId(db, ws)
  loaded.length = 0
  shown.length = 0
  withPage = new Set()
  notify.page.mockClear()
  pages = new TabPages(tabs, views, () => db, notify)
})

describe('TabPages', () => {
  it('選択中のタブを表示する', () => {
    tabs.create(db, ws)
    const b = tabs.create(db, ws)
    pages.showActive(db, ws)
    expect(shown).toEqual([b.id])
  })

  it('今の Workspace でなければ表示しない（別の Workspace のページを重ねない）', () => {
    const other = insertWorkspace(db, { name: 'B', mode: 'custom' }, 0).id
    tabs.create(db, other)
    pages.showActive(db, other)
    expect(shown).toEqual([])
  })

  it('入力を解釈して記録し、ページがあれば読み込む。なければ選択中のタブを表示する', () => {
    const a = tabs.create(db, ws)
    expect(pages.navigate(db, ws, a.id, '3000', []).url).toBe('http://localhost:3000/')
    expect(shown).toEqual([a.id])
    withPage.add(a.id)
    pages.navigate(db, ws, a.id, 'example.com', [])
    expect(loaded).toEqual(['https://example.com/'])
    expect(getTab(db, a.id)?.url).toBe('https://example.com/')
  })

  it('ないタブ・別の Workspace のタブは開けない', () => {
    const other = insertWorkspace(db, { name: 'B', mode: 'custom' }, 0).id
    const otherTab = tabs.create(db, other)
    expect(() => pages.navigate(db, ws, otherTab.id, 'x', [])).toThrow(TabNotFoundError)
    expect(() => pages.navigate(db, ws, 999, 'x', [])).toThrow(TabNotFoundError)
  })

  it('ページが移動したら URL とタイトルを記録して知らせる。閉じたタブの知らせは記録しない', () => {
    const a = tabs.create(db, ws)
    const page: PageState = {
      url: 'https://a.example/',
      title: 'A',
      canGoBack: false,
      canGoForward: false,
      loading: false
    }
    pages.pageChanged(a.id, page)
    expect(getTab(db, a.id)).toMatchObject({ url: 'https://a.example/', title: 'A' })
    expect(notify.page).toHaveBeenCalledWith(a.id, page)
    notify.page.mockClear()
    expect(() => pages.pageChanged(999, page)).not.toThrow()
    expect(notify.page).not.toHaveBeenCalled()
  })

  it('開いてよい URL でなければ記録しない（file: へのリダイレクトのエラーページなど）', () => {
    const a = tabs.create(db, ws)
    pages.navigate(db, ws, a.id, 'example.com', [])
    const page: PageState = {
      url: 'file:///etc/passwd',
      title: '',
      canGoBack: true,
      canGoForward: false,
      loading: false
    }
    pages.pageChanged(a.id, page, true)
    expect(getTab(db, a.id)?.url).toBe('https://example.com/')
  })

  it('読み込みの開始・終了の知らせ（確定前）では記録しない。知らせは送る', () => {
    const a = tabs.create(db, ws)
    withPage.add(a.id)
    pages.navigate(db, ws, a.id, 'example.com', [])
    const old: PageState = {
      url: 'https://old.example/',
      title: 'old',
      canGoBack: true,
      canGoForward: false,
      loading: true
    }
    pages.pageChanged(a.id, old, false)
    expect(getTab(db, a.id)?.url).toBe('https://example.com/')
    expect(notify.page).toHaveBeenCalledWith(a.id, old)
  })
})
