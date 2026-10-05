import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import { beginSession, decideStartupMode, recordCleanExit } from './startupMode'

const HOUR = 60 * 60 * 1000
const settings = { showDeveloperHome: true, developerHomeAfterMinutes: 60 }

describe('decideStartupMode（F11）', () => {
  it('前回の終了から1時間以内なら、前回の Workspace とタブを復元する（ちょうど1時間も含む）', () => {
    expect(
      decideStartupMode(
        { lastQuitMs: 10 * HOUR, cleanExit: true },
        true,
        10 * HOUR + 1000,
        settings
      )
    ).toBe('restore')
    expect(
      decideStartupMode({ lastQuitMs: 10 * HOUR, cleanExit: true }, true, 11 * HOUR, settings)
    ).toBe('restore')
  })

  it('1時間を超えたら Developer Home', () => {
    expect(
      decideStartupMode({ lastQuitMs: 10 * HOUR, cleanExit: true }, true, 11 * HOUR + 1, settings)
    ).toBe('developer-home')
    expect(
      decideStartupMode({ lastQuitMs: 10 * HOUR, cleanExit: true }, true, 30 * HOUR, settings)
    ).toBe('developer-home')
  })

  it('「Developer Home を表示しない」設定なら、いつも復元する', () => {
    expect(
      decideStartupMode({ lastQuitMs: 10 * HOUR, cleanExit: true }, true, 30 * HOUR, {
        ...settings,
        showDeveloperHome: false
      })
    ).toBe('restore')
  })

  it('時間は設定で変えられる（分）', () => {
    const tenMinutes = { ...settings, developerHomeAfterMinutes: 10 }
    expect(
      decideStartupMode({ lastQuitMs: 0, cleanExit: true }, true, 10 * 60 * 1000, tenMinutes)
    ).toBe('restore')
    expect(
      decideStartupMode({ lastQuitMs: 0, cleanExit: true }, true, 10 * 60 * 1000 + 1, tenMinutes)
    ).toBe('developer-home')
  })

  it('前回の正常な終了の記録がない（初めての起動）なら復元する', () => {
    expect(
      decideStartupMode({ lastQuitMs: null, cleanExit: true }, true, 30 * HOUR, settings)
    ).toBe('restore')
  })

  it('異常終了の後で Workspace があれば、復元するかを聞く（F12）。古い記録や「表示しない」設定に関係なく', () => {
    const crashed = { lastQuitMs: 10 * HOUR, cleanExit: false }
    expect(decideStartupMode(crashed, true, 30 * HOUR, settings)).toBe('crash')
    expect(
      decideStartupMode(crashed, true, 10 * HOUR + 1, { ...settings, showDeveloperHome: false })
    ).toBe('crash')
  })

  it('異常終了の後でも Workspace がなければ、聞かない（作成画面になる）', () => {
    expect(decideStartupMode({ lastQuitMs: null, cleanExit: false }, false, 0, settings)).toBe(
      'restore'
    )
  })

  it('時計が戻っていた（終了の時刻が今より後）なら復元する', () => {
    expect(
      decideStartupMode({ lastQuitMs: 30 * HOUR, cleanExit: true }, true, 10 * HOUR, settings)
    ).toBe('restore')
  })
})

describe('前回の終了の記録（app_state の last_quit_time_ms・clean_exit）', () => {
  it('起動したら clean_exit を 0 にし、正常に終了したら時刻と 1 を書く。0 のまま起動したら異常終了', () => {
    const db = new DatabaseSync(':memory:')
    migrate(db, migrations)
    // 初めて（既定は clean_exit = 1、記録なし）
    expect(beginSession(db)).toEqual({ lastQuitMs: null, cleanExit: true })
    recordCleanExit(db, 1234)
    expect(beginSession(db)).toEqual({ lastQuitMs: 1234, cleanExit: true })
    // 終了を記録せずに、もう一度起動した（異常終了）。前回の正常な終了の時刻は残っている
    expect(beginSession(db)).toEqual({ lastQuitMs: 1234, cleanExit: false })
  })
})
