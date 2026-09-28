import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// main.css の色のトークン（ライトは :root、ダークは prefers-color-scheme: dark の :root）
const css = readFileSync(join(__dirname, 'main.css'), 'utf8')
// 値は #rrggbb だけにする（ほかの書き方だと、ここで読めずに検査から漏れるため、失敗させる）
function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => {
      const value = m[2]!.trim().toLowerCase()
      if (!/^#[0-9a-f]{6}$/.test(value)) throw new Error(`--${m[1]} は #rrggbb で書く: ${value}`)
      return [m[1]!, value]
    })
  )
}
const darkBlock = /@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/.exec(css)
if (!darkBlock) throw new Error('main.css にダークの :root がない')
const light = tokens(css.slice(0, darkBlock.index))
const dark = { ...light, ...tokens(darkBlock[1]!) }

// WCAG 2.x のコントラスト比
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

// 文字と、その下に来る背景の組み合わせ（F15: ライト・ダークの両方で AA = 4.5:1 以上）
const pairs: [text: string, background: string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'selected'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['text-muted', 'selected'],
  ['on-mode-production', 'mode-production'],
  ['on-mode-development', 'mode-development'],
  ['on-mode-testing', 'mode-testing'],
  ['on-mode-custom', 'mode-custom']
]

describe.each([
  ['ライト', light],
  ['ダーク', dark]
])('色のコントラスト（%s）', (_name, theme) => {
  it.each(pairs)('%s / %s は 4.5:1 以上', (text, background) => {
    expect(theme[text], text).toBeDefined()
    expect(theme[background], background).toBeDefined()
    expect(contrast(theme[text]!, theme[background]!)).toBeGreaterThanOrEqual(4.5)
  })
})

it('コントラスト比の計算（白と黒は 21:1、同じ色は 1:1）', () => {
  expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
  expect(contrast('#777777', '#777777')).toBe(1)
})
