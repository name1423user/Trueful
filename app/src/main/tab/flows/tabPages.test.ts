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
const actions: string[] = []
const destroyed: number[] = []
const views = {
  show: (tab: { id: number }) => shown.push(tab.id),
  destroy: (id: number) => destroyed.push(id),
  webContents: (id: number) =>
    withPage.has(id)
      ? {
          loadURL: async (url: string) => void loaded.push(url),
          navigationHistory: {
            goBack: () => actions.push('back'),
            goForward: () => actions.push('forward')
          },
          reload: () => actions.push('reload'),
          stop: () => actions.push('stop')
        }
      : undefined
} as unknown as TabViews
const notify = { page: vi.fn(), tabsChanged: vi.fn() }
let pages: TabPages

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
  tabs = new TabFlows()
  ws = insertWorkspace(db, { name: 'A', mode: 'custom' }, 0).id
  setCurrentWorkspaceId(db, ws)
  loaded.length = 0
  actions.length = 0
  destroyed.length = 0
  shown.length = 0
  withPage = new Set()
  notify.page.mockClear()
  notify.tabsChanged.mockClear()
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

  it('閉じるとページを破棄し、次に選ばれたタブを表示する', () => {
    const a = tabs.create(db, ws)
    const b = tabs.create(db, ws)
    const state = pages.close(db, ws, b.id)
    expect(destroyed).toEqual([b.id])
    expect(state.activeId).toBe(a.id)
    expect(shown.at(-1)).toBe(a.id)
  })

  it('戻る・進む・再読み込み・停止をページに伝える。ページがなければ何もしない。別の Workspace のタブは不可', () => {
    const a = tabs.create(db, ws)
    pages.control(db, ws, a.id, 'back')
    expect(actions).toEqual([])
    withPage.add(a.id)
    for (const action of ['back', 'forward', 'reload', 'stop'] as const) {
      pages.control(db, ws, a.id, action)
    }
    expect(actions).toEqual(['back', 'forward', 'reload', 'stop'])
    const other = insertWorkspace(db, { name: 'B', mode: 'custom' }, 0).id
    expect(() => pages.control(db, other, a.id, 'back')).toThrow(TabNotFoundError)
  })

  it('ショートカットは今の Workspace に対して行い、タブ列の変化を知らせる', () => {
    const a = tabs.create(db, ws)
    pages.command(db, 'new')
    expect(tabs.list(db, ws).tabs).toHaveLength(2)
    expect(notify.tabsChanged).toHaveBeenLastCalledWith(ws)
    const { activeId } = tabs.list(db, ws)
    tabs.activate(db, ws, activeId!)
    pages.command(db, 'close')
    expect(tabs.list(db, ws).tabs.map((t) => t.id)).toEqual([a.id])
    pages.navigate(db, ws, a.id, 'example.com', [])
    pages.command(db, 'close')
    pages.command(db, 'reopen')
    expect(tabs.list(db, ws).tabs.map((t) => t.url)).toContain('https://example.com/')
    withPage.add(tabs.list(db, ws).activeId!)
    pages.command(db, 'reload')
    expect(actions).toEqual(['reload'])
  })

  it('今の Workspace がなければ、ショートカットは何もしない', () => {
    setCurrentWorkspaceId(db, null)
    pages.command(db, 'new')
    expect(notify.tabsChanged).not.toHaveBeenCalled()
  })

  it('ページが新しいウィンドウを開こうとしたら、同じ Workspace の新しいタブで開く（http・https だけ）', () => {
    const a = tabs.create(db, ws)
    pages.openRequested(a.id, 'https://b.example/')
    const state = tabs.list(db, ws)
    expect(state.tabs.map((t) => t.url)).toEqual(['about:blank', 'https://b.example/'])
    expect(state.activeId).toBe(state.tabs[1]!.id)
    expect(notify.tabsChanged).toHaveBeenCalledWith(ws)
    pages.openRequested(a.id, 'javascript:alert(1)')
    pages.openRequested(a.id, 'about:blank')
    pages.openRequested(999, 'https://c.example/')
    expect(tabs.list(db, ws).tabs).toHaveLength(2)
  })

  it('background（Cmd/Ctrl+クリック・中クリック）のときは、開いたタブを選ばない', () => {
    const a = tabs.create(db, ws)
    pages.openRequested(a.id, 'https://b.example/', true)
    const state = tabs.list(db, ws)
    expect(state.tabs).toHaveLength(2)
    expect(state.activeId).toBe(a.id)
  })
})
