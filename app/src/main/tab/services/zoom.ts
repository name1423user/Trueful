// ページの拡大・縮小の段階（F02。Chrome と同じ 25%〜500%）
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]
// 浮動小数の誤差で、同じ段階に留まらないように
const EPSILON = 0.001

// 今の倍率から、次の段階の倍率を返す（端では止まる。reset は 100%）
export function nextZoomFactor(current: number, direction: 'in' | 'out' | 'reset'): number {
  if (direction === 'reset') return 1
  if (direction === 'in') return STEPS.find((s) => s > current + EPSILON) ?? STEPS.at(-1)!
  return STEPS.findLast((s) => s < current - EPSILON) ?? STEPS[0]!
}
