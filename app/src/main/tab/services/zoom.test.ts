import { describe, expect, it } from 'vitest'
import { nextZoomFactor } from './zoom'

describe('ページの拡大・縮小の段階（Chrome と同じ）', () => {
  it('1 つずつ上げ下げし、0 で 100% に戻す', () => {
    expect(nextZoomFactor(1, 'in')).toBe(1.1)
    expect(nextZoomFactor(1.1, 'in')).toBe(1.25)
    expect(nextZoomFactor(1, 'out')).toBe(0.9)
    expect(nextZoomFactor(0.9, 'out')).toBe(0.8)
    expect(nextZoomFactor(2.5, 'reset')).toBe(1)
  })

  it('端では止まる（25%〜500%）', () => {
    expect(nextZoomFactor(5, 'in')).toBe(5)
    expect(nextZoomFactor(0.25, 'out')).toBe(0.25)
  })

  it('段階の間の値（ピンチなどで変わった）からは、次の段階へ', () => {
    expect(nextZoomFactor(1.05, 'in')).toBe(1.1)
    expect(nextZoomFactor(1.05, 'out')).toBe(1)
    // 浮動小数の誤差で、同じ段階に留まらない
    expect(nextZoomFactor(1.1000000001, 'in')).toBe(1.25)
    expect(nextZoomFactor(0.8999999999, 'out')).toBe(0.8)
  })
})
