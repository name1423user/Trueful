// 休止（Dormant）の表示まわり（F01、ADR-011・ADR-012）。アーカイブは表示上だけで、DB には書かない
export const ARCHIVE_AFTER_DAYS = 30

export type DisplayState = 'active' | 'dormant' | 'archived'

type Item = {
  id: number
  name: string
  status: 'active' | 'dormant'
  dormantedTimeMs: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

export function displayState(w: Item, nowMs: number): DisplayState {
  if (w.status === 'active') return 'active'
  if (w.dormantedTimeMs !== null && nowMs - w.dormantedTimeMs >= ARCHIVE_AFTER_DAYS * DAY_MS) {
    return 'archived'
  }
  return 'dormant'
}

// 前の一覧では active で、次の一覧では dormant になったもの（自動で休止したものを事後に知らせる）
export function newlyDormant<T extends Item>(prev: Item[], next: T[]): T[] {
  const wasActive = new Set(prev.filter((w) => w.status === 'active').map((w) => w.id))
  return next.filter((w) => w.status === 'dormant' && wasActive.has(w.id))
}
