// 最近使ったタブ列（F15）に並べるタブ。最後に見た順に count 枚まで（同じ時刻なら id の順で、並びを揺らさない）
export function recentTabs<T extends { id: number; lastActiveTimeMs: number }>(
  tabs: T[],
  count: number
): T[] {
  return [...tabs]
    .sort((a, b) => b.lastActiveTimeMs - a.lastActiveTimeMs || a.id - b.id)
    .slice(0, count)
}
