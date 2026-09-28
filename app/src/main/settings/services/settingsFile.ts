import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { defaultSettings, parseSettings, type Settings, type SettingsKey } from './settingsSchema'

// 読み込みで見つかった問題（Renderer に知らせる）。画面に出すときは kind から辞書を引く
export type SettingsProblem =
  | { kind: 'invalid-json'; brokenFile: string }
  | { kind: 'invalid-values'; keys: SettingsKey[] }
  // 読めない・書けない（権限など）。既定値で動かし、変更は保存しない
  | { kind: 'unavailable' }

// 書けなかったとき。ADR-014 と同じく、.code（ENOSPC・EACCES など）で種類を見分けられるようにする
export class SettingsFileError extends Error {
  readonly code: string | undefined
  constructor(
    readonly path: string,
    options: { cause: unknown }
  ) {
    super(`settings.json を書けなかった: ${path}`, options)
    this.name = 'SettingsFileError'
    this.code = (options.cause as NodeJS.ErrnoException | undefined)?.code
  }
}

export function serializeSettings(settings: Settings): string {
  return `${JSON.stringify(settings, null, 2)}\n`
}

// 一時ファイルに書いてから名前を変える（ADR-014 と同じ形）
export function writeSettingsFile(path: string, settings: Settings): string {
  const text = serializeSettings(settings)
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, text)
    renameSync(tmp, path)
    return text
  } catch (e) {
    rmSync(tmp, { force: true })
    throw new SettingsFileError(path, { cause: e })
  }
}

// JSON として読めないファイルを settings.json.broken-<時刻> に移して残す（人の編集を消さないため）
export function preserveBrokenFile(path: string, now = Date.now()): string | undefined {
  if (!existsSync(path)) return undefined
  try {
    JSON.parse(readFileSync(path, 'utf8'))
    return undefined
  } catch {
    const brokenFile = `${path}.broken-${now}`
    renameSync(path, brokenFile)
    return brokenFile
  }
}

// settings.json を読む。一部の値が不正なときは、その項目だけ既定値にする（ファイルは、人が直せるように書き換えない）。
// repair（起動時）: ないときは既定値で作り、JSON として読めないときは壊れたファイルを残して作り直す。
// repair なし（起動中に読み直すとき）: 保存の途中を読んだだけかもしれないので、ファイルには触らない
export function readSettingsFile(
  path: string,
  { repair, now = Date.now() }: { repair: boolean; now?: number }
): { settings: Settings; problem?: SettingsProblem } | undefined {
  if (repair) {
    const brokenFile = preserveBrokenFile(path, now)
    if (brokenFile || !existsSync(path)) {
      const settings = defaultSettings()
      writeSettingsFile(path, settings)
      return brokenFile ? { settings, problem: { kind: 'invalid-json', brokenFile } } : { settings }
    }
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
  const { settings, invalidKeys } = parseSettings(raw)
  if (invalidKeys.length > 0) {
    return { settings, problem: { kind: 'invalid-values', keys: invalidKeys } }
  }
  return { settings }
}
