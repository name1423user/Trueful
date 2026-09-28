import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { defaultSettings, parseSettings, type Settings, type SettingsKey } from './settingsSchema'

// 読み込みで見つかった問題（Renderer に知らせる）。画面に出すときは kind から辞書を引く
export type SettingsProblem =
  | { kind: 'invalid-json'; brokenFile: string }
  | { kind: 'invalid-values'; keys: SettingsKey[] }
  // 読めない・書けない（権限など）。既定値で動かし、変更は保存できない
  | { kind: 'unavailable' }

export class SettingsFileError extends Error {
  constructor(
    readonly path: string,
    options: { cause: unknown }
  ) {
    super(`settings.json を書けなかった: ${path}`, options)
    this.name = 'SettingsFileError'
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

// settings.json を読む。一部の値が不正なときは、その項目だけ既定値にする（ファイルは、人が直せるように書き換えない）。
// repair（起動時）: ないときは既定値で作り、JSON として読めないときは壊れたファイルを残して作り直す。
// repair なし（起動中に読み直すとき）: 保存の途中を読んだだけかもしれないので、ファイルには触らない
export function readSettingsFile(
  path: string,
  { repair, now = Date.now() }: { repair: boolean; now?: number }
): { settings: Settings; problem?: SettingsProblem } | undefined {
  if (!existsSync(path)) {
    if (!repair) return undefined
    const settings = defaultSettings()
    writeSettingsFile(path, settings)
    return { settings }
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    if (!repair) return undefined
    const brokenFile = `${path}.broken-${now}`
    renameSync(path, brokenFile)
    const settings = defaultSettings()
    writeSettingsFile(path, settings)
    return { settings, problem: { kind: 'invalid-json', brokenFile } }
  }
  const { settings, invalidKeys } = parseSettings(raw)
  if (invalidKeys.length > 0) {
    return { settings, problem: { kind: 'invalid-values', keys: invalidKeys } }
  }
  return { settings }
}
