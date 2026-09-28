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
  const open = (): SettingsStore => (store = SettingsStore.open(dir, (s) => changes.push(s)))
  const file = (): string => join(dir, SETTINGS_FILE)

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trueful-settings-'))
    changes.length = 0
  })
  afterEach(() => {
    store?.close()
    store = undefined
    rmSync(dir, { recursive: true, force: true })
  })

  it('ファイルがなければ既定値で作る', () => {
    expect(open().get()).toEqual({ settings: defaultSettings() })
    expect(JSON.parse(readFileSync(file(), 'utf8'))).toEqual(defaultSettings())
  })

  it('JSON として読めなければ、壊れたファイルを残し、既定値で起動して問題を伝える', () => {
    writeFileSync(file(), '{ "theme": "dark", ')
    const { settings, problem } = open().get()
    expect(settings).toEqual(defaultSettings())
    expect(problem).toMatchObject({ kind: 'invalid-json' })
    const broken = readdirSync(dir).filter((f) => f.startsWith(`${SETTINGS_FILE}.broken-`))
    expect(broken).toHaveLength(1)
    expect(readFileSync(join(dir, broken[0]), 'utf8')).toBe('{ "theme": "dark", ')
  })

  it('一部の値が不正なら、その項目だけ既定値にし、ファイルは書き換えない', () => {
    const text = JSON.stringify({ theme: 'dark', recentTabsCount: -1 })
    writeFileSync(file(), text)
    const { settings, problem } = open().get()
    expect(settings.theme).toBe('dark')
    expect(settings.recentTabsCount).toBe(5)
    expect(problem).toEqual({ kind: 'invalid-values', keys: ['recentTabsCount'] })
    expect(readFileSync(file(), 'utf8')).toBe(text)
  })

  it('更新はファイルにアトミックに書き、変更を知らせる', () => {
    open().update({ theme: 'light' })
    expect(JSON.parse(readFileSync(file(), 'utf8')).theme).toBe('light')
    expect(existsSync(`${file()}.tmp`)).toBe(false)
    expect(changes.at(-1)?.settings.theme).toBe('light')
  })

  it('手で編集されたら読み直して知らせる。保存の途中（読めない JSON）ではファイルに触らない', async () => {
    open()
    writeFileSync(file(), '{ "theme": ')
    writeFileSync(file(), JSON.stringify({ ...defaultSettings(), theme: 'dark' }))
    await vi.waitFor(() => expect(changes.at(-1)?.settings.theme).toBe('dark'), { timeout: 3000 })
    expect(readdirSync(dir).some((f) => f.includes('.broken-'))).toBe(false)
  })
})
