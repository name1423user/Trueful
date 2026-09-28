import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../services/settingsSchema'
import { SETTINGS_FILE, SettingsStore, type SettingsSnapshot } from './settingsStore'

describe('SettingsStore', () => {
  let dir: string
  let store: SettingsStore | undefined
  const changes: SettingsSnapshot[] = []
  const file = (): string => join(dir, SETTINGS_FILE)
  // 見張りなしで作る（読み直しは reload() を直接呼んで確かめる）
  const create = (): SettingsStore => (store = new SettingsStore(file(), (s) => changes.push(s)))
  const writeJson = (value: unknown): void => writeFileSync(file(), JSON.stringify(value))
  const brokenFiles = (): string[] => readdirSync(dir).filter((f) => f.includes('.broken-'))

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trueful-settings-'))
    changes.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    store?.close()
    store = undefined
    rmSync(dir, { recursive: true, force: true })
  })

  it('ファイルがなければ既定値で作る', () => {
    expect(create().get()).toEqual({ settings: defaultSettings() })
    expect(JSON.parse(readFileSync(file(), 'utf8'))).toEqual(defaultSettings())
  })

  it('JSON として読めなければ、壊れたファイルを残し、既定値で起動して問題を伝える', () => {
    writeFileSync(file(), '{ "theme": "dark", ')
    const { settings, problem } = create().get()
    expect(settings).toEqual(defaultSettings())
    expect(problem).toMatchObject({ kind: 'invalid-json' })
    expect(brokenFiles()).toHaveLength(1)
    expect(readFileSync(join(dir, brokenFiles()[0]), 'utf8')).toBe('{ "theme": "dark", ')
  })

  it('壊れた JSON を作り直した後、自分の書き込みの知らせが遅れて届いても、問題の記録を消さない', () => {
    // macOS では、起動時に作り直した書き込みの知らせが、見張りを始めた後に届くことがある
    writeFileSync(file(), '{')
    create().reload()
    expect(store!.get().problem).toMatchObject({ kind: 'invalid-json' })
    expect(changes).toEqual([])
  })

  it('一部の値が不正なら、その項目だけ既定値にし、ファイルは書き換えない', () => {
    const text = JSON.stringify({ theme: 'dark', recentTabsCount: -1 })
    writeFileSync(file(), text)
    const { settings, problem } = create().get()
    expect(settings.theme).toBe('dark')
    expect(settings.recentTabsCount).toBe(5)
    expect(problem).toEqual({ kind: 'invalid-values', keys: ['recentTabsCount'] })
    expect(readFileSync(file(), 'utf8')).toBe(text)
  })

  it('更新はファイルにアトミックに書き、変更を知らせる', () => {
    create().update({ theme: 'light' })
    expect(JSON.parse(readFileSync(file(), 'utf8')).theme).toBe('light')
    expect(existsSync(`${file()}.tmp`)).toBe(false)
    expect(changes.at(-1)?.settings.theme).toBe('light')
  })

  it('手で編集されたら読み直して知らせる。自分の書き込みや読めない途中の状態では知らせない', () => {
    const s = create()
    s.update({ theme: 'light' })
    changes.length = 0
    s.reload()
    expect(changes).toHaveLength(0)
    writeFileSync(file(), '{ "theme": ')
    s.reload()
    expect(changes).toHaveLength(0)
    expect(brokenFiles()).toHaveLength(0)
    writeJson({ ...defaultSettings(), theme: 'dark' })
    s.reload()
    expect(changes.at(-1)?.settings.theme).toBe('dark')
  })

  it('不正な値を人が直したら、中身が既定値と同じでも問題を消して知らせる', () => {
    const s = create()
    writeJson({ ...defaultSettings(), recentTabsCount: -1 })
    s.reload()
    expect(s.get().problem).toMatchObject({ kind: 'invalid-values' })
    writeJson(defaultSettings())
    s.reload()
    expect(s.get().problem).toBeUndefined()
    expect(changes.at(-1)?.problem).toBeUndefined()
  })

  it('起動中に人が壊れた JSON を保存していたら、更新の前にそれを残す', () => {
    const s = create()
    writeFileSync(file(), '{ "theme": "dark", oops')
    s.update({ recentTabsCount: 3 })
    expect(brokenFiles()).toHaveLength(1)
    expect(s.get().problem).toMatchObject({ kind: 'invalid-json' })
    expect(JSON.parse(readFileSync(file(), 'utf8')).recentTabsCount).toBe(3)
  })

  it('読み書きできないときは、既定値で起動し、更新は保存せずに失敗する', () => {
    // 保存場所のフォルダがない（書けない）場合。見張りも始められないが、起動は止めない
    const missing = join(dir, 'missing')
    store = SettingsStore.open(missing, (c) => changes.push(c))
    expect(store.get()).toEqual({ settings: defaultSettings(), problem: { kind: 'unavailable' } })
    expect(() => store!.update({ theme: 'dark' })).toThrow()
    expect(existsSync(missing)).toBe(false)
  })

  it('open() はフォルダを見張り、手での編集を反映する', async () => {
    store = SettingsStore.open(dir, (c) => changes.push(c))
    // 見張りが動き始めるまで少し待ってから書く（macOS の FSEvents は、始めた直後の変更を取りこぼすことがある）
    await new Promise((r) => setTimeout(r, 200))
    writeJson({ ...defaultSettings(), theme: 'dark' })
    await vi.waitFor(() => expect(changes.at(-1)?.settings.theme).toBe('dark'), { timeout: 5000 })
  })
})
