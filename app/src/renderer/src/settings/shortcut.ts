type Shortcut = { keyword: string; urlTemplate: string }

const MAX_SHORTCUTS = 50

// 近道を足す前の検査（F10・F14）。規則は Main の settingsSchema と同じ（最後は Main が検証する）。
// 問題があれば、辞書 settings.shortcutProblem.* のキーを返す
export function shortcutProblem(
  keyword: string,
  urlTemplate: string,
  existing: Shortcut[]
): 'tooMany' | 'keyword' | 'keywordDigits' | 'keywordDuplicate' | 'url' | undefined {
  if (existing.length >= MAX_SHORTCUTS) return 'tooMany'
  if (!/^[a-z0-9-]{1,20}$/.test(keyword)) return 'keyword'
  // 数字だけは、組み込みの localhost の近道とぶつかる
  if (/^\d+$/.test(keyword)) return 'keywordDigits'
  if (existing.some((s) => s.keyword === keyword)) return 'keywordDuplicate'
  if (!URL.canParse(urlTemplate) || !/^https?:$/.test(new URL(urlTemplate).protocol)) return 'url'
  if (!urlTemplate.includes('%s')) return 'url'
  return undefined
}
