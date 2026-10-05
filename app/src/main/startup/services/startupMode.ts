import type { DatabaseSync } from 'node:sqlite'

// 起動したときに、前回の Workspace とタブを復元するか、Developer Home を出すか（F11）、
// 異常終了の後なので復元するかを聞くか（crash。F12）
export type StartupMode = 'restore' | 'developer-home' | 'crash'

// 前回の終了の記録（data-schema.md の app_state）。cleanExit が false なら、前回は異常終了だった
export type LastSession = { lastQuitMs: number | null; cleanExit: boolean }

// 前回が異常終了で Workspace があるなら、復元するかを聞く（Workspace がなければ作成画面になるので聞かない）。
// それ以外は、前回の正常な終了から「Developer Home までの時間」以内なら復元、超えたら Developer Home。
// 「表示しない」設定なら、いつも復元する。終了の記録がない（初めて）・時計が戻っていたときも復元する
export function decideStartupMode(
  last: LastSession,
  hasWorkspaces: boolean,
  nowMs: number,
  settings: { showDeveloperHome: boolean; developerHomeAfterMinutes: number }
): StartupMode {
  if (!last.cleanExit) return hasWorkspaces ? 'crash' : 'restore'
  if (!settings.showDeveloperHome || last.lastQuitMs === null) return 'restore'
  return nowMs - last.lastQuitMs > settings.developerHomeAfterMinutes * 60 * 1000
    ? 'developer-home'
    : 'restore'
}

// 起動したときに、前回の終了の記録を読み、clean_exit を 0 にする（data-schema.md の起動時の手順5）。
// 正常に終了すると recordCleanExit で 1 に戻すので、次の起動で 0 なら、前回は異常終了だったと分かる
export function beginSession(db: DatabaseSync): LastSession {
  const row = db.prepare('SELECT last_quit_time_ms, clean_exit FROM app_state WHERE id = 1').get()
  db.prepare('UPDATE app_state SET clean_exit = 0 WHERE id = 1').run()
  const ms = row?.['last_quit_time_ms']
  return {
    lastQuitMs: ms === null || ms === undefined ? null : Number(ms),
    cleanExit: row?.['clean_exit'] !== 0
  }
}

// 正常に終了するときに、時刻と「正常に終了した」を記録する
export function recordCleanExit(db: DatabaseSync, nowMs: number): void {
  db.prepare('UPDATE app_state SET last_quit_time_ms = ?, clean_exit = 1 WHERE id = 1').run(nowMs)
}
