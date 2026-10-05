import type { DatabaseSync } from 'node:sqlite'

// 起動したときに、前回の Workspace とタブを復元するか、Developer Home を出すか（F11）
export type StartupMode = 'restore' | 'developer-home'

// 前回の正常な終了から「Developer Home までの時間」以内なら復元、超えたら Developer Home。
// 「表示しない」設定なら、いつも復元する。終了の記録がない（初めて・異常終了の後）・時計が戻っていたときも復元する
export function decideStartupMode(
  lastQuitMs: number | null,
  nowMs: number,
  settings: { showDeveloperHome: boolean; developerHomeAfterMinutes: number }
): StartupMode {
  if (!settings.showDeveloperHome || lastQuitMs === null) return 'restore'
  return nowMs - lastQuitMs > settings.developerHomeAfterMinutes * 60 * 1000
    ? 'developer-home'
    : 'restore'
}

export function getLastQuitTime(db: DatabaseSync): number | null {
  const v = db.prepare('SELECT last_quit_time_ms v FROM app_state WHERE id = 1').get()?.['v']
  return v === null || v === undefined ? null : Number(v)
}

// 正常に終了するときに記録する
export function setLastQuitTime(db: DatabaseSync, ms: number | null): void {
  db.prepare('UPDATE app_state SET last_quit_time_ms = ? WHERE id = 1').run(ms)
}
