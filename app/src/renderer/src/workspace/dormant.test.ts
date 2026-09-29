import { describe, expect, it } from 'vitest'
import { ARCHIVE_AFTER_DAYS, displayState, newlyDormant } from './dormant'

const DAY = 24 * 60 * 60 * 1000
const w = (
  id: number,
  status: 'active' | 'dormant',
  dormantedTimeMs: number | null = null
): { id: number; name: string; status: 'active' | 'dormant'; dormantedTimeMs: number | null } => ({
  id,
  name: `W${id}`,
  status,
  dormantedTimeMs
})

describe('Workspace の表示上の状態（F01・ADR-011。DB には書かない）', () => {
  it('アーカイブは休止 30 日以上', () => {
    expect(ARCHIVE_AFTER_DAYS).toBe(30)
  })

  it('active は active、休止 29 日は dormant、30 日ちょうどからアーカイブ', () => {
    const now = 100 * DAY
    expect(displayState(w(1, 'active'), now)).toBe('active')
    expect(displayState(w(1, 'dormant', now - 29 * DAY), now)).toBe('dormant')
    expect(displayState(w(1, 'dormant', now - 30 * DAY), now)).toBe('archived')
    expect(displayState(w(1, 'dormant', now - 31 * DAY), now)).toBe('archived')
  })

  it('休止した時刻が分からない（null）ときは dormant のまま', () => {
    expect(displayState(w(1, 'dormant', null), 100 * DAY)).toBe('dormant')
  })
})

describe('新しく休止した Workspace（事後の知らせ用）', () => {
  it('前は active で、今は dormant のものだけ', () => {
    const prev = [w(1, 'active'), w(2, 'active'), w(3, 'dormant', 1)]
    const next = [w(1, 'dormant', 5), w(2, 'active'), w(3, 'dormant', 1), w(4, 'active')]
    expect(newlyDormant(prev, next).map((x) => x.id)).toEqual([1])
  })

  it('前の一覧にないもの、最初の読み込み（前が空）は知らせない', () => {
    expect(newlyDormant([], [w(1, 'dormant', 1)])).toEqual([])
    expect(newlyDormant([w(1, 'active')], [w(2, 'dormant', 1)])).toEqual([])
  })
})
