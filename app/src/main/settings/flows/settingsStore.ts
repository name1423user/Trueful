import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  preserveBrokenFile,
  readSettingsFile,
  serializeSettings,
  writeSettingsFile,
  type SettingsProblem
} from '../services/settingsFile'
import { defaultSettings, settingsSchema, type Settings } from '../services/settingsSchema'

export const SETTINGS_FILE = 'settings.json'

export type SettingsSnapshot = { settings: Settings; problem?: SettingsProblem }

// 設定を持ち、更新と、手で編集されたときの読み直しを受け持つ（F14 の Everything Configurable）
export class SettingsStore {
  private snapshot: SettingsSnapshot
  private watcher: FSWatcher | undefined
  private timer: NodeJS.Timeout | undefined
  // 自分で書いた中身。見張りで自分の書き込みを拾ったときに、読み直しを飛ばすため
  private lastWritten: string

  constructor(
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

  // 開いて、手での編集を見張る。見張りを始められなくても（inotify の上限など）起動は止めない
  static open(dir: string, onChange: (snapshot: SettingsSnapshot) => void): SettingsStore {
    const store = new SettingsStore(join(dir, SETTINGS_FILE), onChange)
    try {
      // エディタは名前を変えて保存することがあるので、ファイルではなくフォルダを見張る。
      // ファイル名が渡されない OS もあるので、そのときも読み直す（自分の書き込みは lastWritten で飛ばす）
      store.watcher = watch(dirname(store.path), (_event, file) => {
        if (file && file !== basename(store.path)) return
        clearTimeout(store.timer)
        store.timer = setTimeout(() => store.reload(), 100)
      })
      store.watcher.on('error', (e) => {
        console.error('[main] settings.json の見張りが止まった', e)
        store.watcher?.close()
        store.watcher = undefined
      })
    } catch (e) {
      console.error('[main] settings.json を見張れない（手での編集は次の起動で反映）', e)
    }
    return store
  }

  get(): SettingsSnapshot {
    return this.snapshot
  }

  // 一部の項目を更新する。読み書きできない状態では保存しない（読めなかったファイルを上書きしないため）
  update(patch: Partial<Settings>): Settings {
    if (this.snapshot.problem?.kind === 'unavailable') {
      throw new Error('settings.json を読み書きできないので、更新できない')
    }
    const settings = settingsSchema.parse({ ...this.snapshot.settings, ...patch })
    // 起動中に人が壊れた JSON を保存していたら、上書きする前に残す
    const brokenFile = preserveBrokenFile(this.path)
    this.lastWritten = writeSettingsFile(this.path, settings)
    this.snapshot = brokenFile
      ? { settings, problem: { kind: 'invalid-json', brokenFile } }
      : { settings }
    this.onChange(this.snapshot)
    return settings
  }

  close(): void {
    clearTimeout(this.timer)
    this.watcher?.close()
  }

  // 手で編集されたら読み直す。読めない途中の状態や、自分の書き込みは無視する。
  // 値が不正・読めなかった状態から直ったときは、中身が同じでも知らせる。
  // 壊れた JSON を作り直した記録（invalid-json）は、ファイルが自分の書いたままなら残す
  // （作り直したときの書き込みの知らせが、遅れて届くことがあるため。macOS）
  reload(): void {
    const next = readSettingsFile(this.path, { repair: false })
    if (!next) return
    const text = serializeSettings(next.settings)
    const unchanged = text === this.lastWritten && !next.problem
    if (unchanged && (this.snapshot.problem?.kind ?? 'invalid-json') === 'invalid-json') return
    this.lastWritten = text
    this.snapshot = next
    this.onChange(next)
  }
}
