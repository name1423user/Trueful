import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { migrations } from '../../db/migrations'
import { migrate } from '../../db/services/migrate'
import {
  decideStartupMode,
  getLastQuitTime,
  setLastQuitTime,
  takeLastQuitTime
} from './startupMode'

const HOUR = 60 * 60 * 1000
const settings = { showDeveloperHome: true, developerHomeAfterMinutes: 60 }

describe('decideStartupMode（F11）', () => {
  it('前回の終了から1時間以内なら、前回の Workspace とタブを復元する（ちょうど1時間も含む）', () => {
    expect(decideStartupMode(10 * HOUR, 10 * HOUR + 1000, settings)).toBe('restore')
    expect(decideStartupMode(10 * HOUR, 11 * HOUR, settings)).toBe('restore')
  })

  it('1時間を超えたら Developer Home', () => {
    expect(decideStartupMode(10 * HOUR, 11 * HOUR + 1, settings)).toBe('developer-home')
    expect(decideStartupMode(10 * HOUR, 30 * HOUR, settings)).toBe('developer-home')
  })

  it('「Developer Home を表示しない」設定なら、いつも復元する', () => {
    expect(decideStartupMode(10 * HOUR, 30 * HOUR, { ...settings, showDeveloperHome: false })).toBe(
      'restore'
    )
  })

  it('時間は設定で変えられる（分）', () => {
    const tenMinutes = { ...settings, developerHomeAfterMinutes: 10 }
    expect(decideStartupMode(0, 10 * 60 * 1000, tenMinutes)).toBe('restore')
    expect(decideStartupMode(0, 10 * 60 * 1000 + 1, tenMinutes)).toBe('developer-home')
  })

  it('前回の正常な終了の記録がない（初めての起動・異常終了の後）なら復元する（異常終了の確認は F12）', () => {
    expect(decideStartupMode(null, 30 * HOUR, settings)).toBe('restore')
  })

  it('時計が戻っていた（終了の時刻が今より後）なら復元する', () => {
    expect(decideStartupMode(30 * HOUR, 10 * HOUR, settings)).toBe('restore')
  })
})

describe('前回の終了の時刻（app_state.last_quit_time_ms）', () => {
  it('読み書きできる。最初は null', () => {
    const db = new DatabaseSync(':memory:')
    migrate(db, migrations)
    expect(getLastQuitTime(db)).toBeNull()
    setLastQuitTime(db, 1234)
    expect(getLastQuitTime(db)).toBe(1234)
    setLastQuitTime(db, null)
    expect(getLastQuitTime(db)).toBeNull()
  })

  it('起動したときに読んで消す（異常終了の後は記録がない）', () => {
    const db = new DatabaseSync(':memory:')
    migrate(db, migrations)
    setLastQuitTime(db, 1234)
    expect(takeLastQuitTime(db)).toBe(1234)
    expect(getLastQuitTime(db)).toBeNull()
    expect(takeLastQuitTime(db)).toBeNull()
  })
})
