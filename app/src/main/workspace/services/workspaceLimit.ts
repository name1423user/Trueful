// フルアクティブ（ページを表示できる状態）な Workspace は最大 5 個（F01）。
// 6 個目になったら、いちばん長く使っていないものを休止（Dormant）にする。確認はせず、後で知らせる（ADR-011）
export const MAX_ACTIVE_WORKSPACES = 5

// 休止にする Workspace。開こうとしている Workspace（keepId）は、条件として除く（ADR-011 の決定 2）。
// 複数を渡せる（タブの移動で復帰させる Workspace と、見ている今の Workspace の両方を守る）
export function workspacesToDormant(
  active: { id: number; lastUsedTimeMs: number }[],
  limit: number,
  keepId: number | readonly number[]
): number[] {
  const over = active.length - limit
  if (over <= 0) return []
  const keep = new Set(typeof keepId === 'number' ? [keepId] : keepId)
  return active
    .filter((w) => !keep.has(w.id))
    .sort((a, b) => a.lastUsedTimeMs - b.lastUsedTimeMs || a.id - b.id)
    .slice(0, over)
    .map((w) => w.id)
}
