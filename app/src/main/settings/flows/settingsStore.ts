import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  readSettingsFile,
  serializeSettings,
  writeSettingsFile,
  type SettingsProblem
} from '../services/settingsFile'
import { defaultSettings, type Settings } from '../services/settingsSchema'

export const SETTINGS_FILE = 'settings.json'

export type SettingsSnapshot = { settings: Settings; problem?: SettingsProblem }

// 設定を持ち、更新と、手で編集されたときの読み直しを受け持つ（F14 の Everything Configurable）
export class SettingsStore {
  private snapshot: SettingsSnapshot
  private watcher: FSWatcher | undefined
  private timer: NodeJS.Timeout | undefined
  // 自分で書いた中身。見張りで自分の書き込みを拾ったときに、読み直しを飛ばすため
  private lastWritten: string

  private constructor(
    private readonly path: string,
    private readonly onChange: (snapshot: SettingsSnapshot) => void
  ) {
    // 起動時は、壊れていれば作り直す（repair）ので、結果は必ずある。
    // ファイルを読み書きできないとき（権限など）も起動は止めず、既定値で動かす
    try {
      this.snapshot = readSettingsFile(path, { repair: true })!
    } catch (e) {
      console.error('[main] settings.json を読み書きできない', e)
      this.snapshot = { settings: defaultSettings(), problem: { kind: 'unavailable' } }
    }
    this.lastWritten = serializeSettings(this.snapshot.settings)
  }

  static open(dir: string, onChange: (snapshot: SettingsSnapshot) => void): SettingsStore {
    const store = new SettingsStore(join(dir, SETTINGS_FILE), onChange)
    // エディタは名前を変えて保存することがあるので、ファイルではなくフォルダを見張る
    store.watcher = watch(dirname(store.path), (_event, file) => {
      if (file !== basename(store.path)) return
      clearTimeout(store.timer)
      store.timer = setTimeout(() => store.reload(), 100)
    })
    return store
  }

  get(): SettingsSnapshot {
    return this.snapshot
  }

  update(patch: Partial<Settings>): Settings {
    const settings = { ...this.snapshot.settings, ...patch }
    this.lastWritten = writeSettingsFile(this.path, settings)
    this.snapshot = { settings }
    this.onChange(this.snapshot)
    return settings
  }

  close(): void {
    clearTimeout(this.timer)
    this.watcher?.close()
  }

  // 手で編集されたら読み直す。読めない途中の状態や、自分の書き込みは無視する
  private reload(): void {
    const next = readSettingsFile(this.path, { repair: false })
    if (!next) return
    const text = serializeSettings(next.settings)
    if (text === this.lastWritten && !next.problem) return
    this.lastWritten = text
    this.snapshot = next
    this.onChange(next)
  }
}
