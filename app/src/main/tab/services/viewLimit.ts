// タブのページ（WebContentsView）の実体は、全 Workspace を合わせて最大 30 個（F02）
export const MAX_PAGE_VIEWS = 30

// 上限を超えたときに破棄するページ。いちばん長く表示していないものから選ぶ（lastShown は表示した順の番号）。
// 表示中のページ（keepTabId）は選ばない
export function viewsToDiscard(
  views: { tabId: number; lastShown: number }[],
  limit: number,
  keepTabId: number
): number[] {
  const over = views.length - limit
  if (over <= 0) return []
  return views
    .filter((v) => v.tabId !== keepTabId)
    .sort((a, b) => a.lastShown - b.lastShown)
    .slice(0, over)
    .map((v) => v.tabId)
}
