import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// main.css の色のトークン（ライトは :root、ダークは prefers-color-scheme: dark の :root）
const css = readFileSync(join(__dirname, 'main.css'), 'utf8')
// 値は #rrggbb だけにする（ほかの書き方だと、ここで読めずに検査から漏れるため、失敗させる）
function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    // 書体と文字の大きさ（--font-*）は色ではないので、typography.test.ts で確かめる
    [...block.matchAll(/--(?!font-(?:ui|mono|size-))([\w-]+):\s*([^;]+);/g)].map((m) => {
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
  // 削除など、元に戻せない操作のボタンの文字（枠だけで、背景は塗らない）
  ['danger', 'bg'],
  ['danger', 'surface'],
  ['on-mode-production', 'mode-production'],
  ['on-mode-development', 'mode-development'],
  ['on-mode-testing', 'mode-testing'],
  ['on-mode-custom', 'mode-custom'],
  // 地の色は、今の Workspace の Mode 色を薄く混ぜたもの（T4-5b）。その上の文字も AA
  ...(['production', 'development', 'testing', 'custom'] as const).flatMap(
    (m): [string, string][] => [
      ['text', `bg-${m}`],
      ['text-muted', `bg-${m}`],
      ['danger', `bg-${m}`]
    ]
  )
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

describe('地の色（T4-5b）', () => {
  it.each(['production', 'development', 'testing', 'custom'])(
    '%s の Workspace では、地を --bg-%s にする',
    (m) => {
      expect(css).toMatch(
        new RegExp(`\\.app-shell\\[data-mode='${m}'\\] \\{[^}]*--bg: var\\(--bg-${m}\\);`)
      )
    }
  )

  it('地の色は Mode ごとに違い、どれも素の地（--bg）とも違う', () => {
    for (const theme of [light, dark]) {
      const bgs = ['bg', 'bg-production', 'bg-development', 'bg-testing', 'bg-custom'].map(
        (k) => theme[k]
      )
      expect(new Set(bgs).size).toBe(5)
    }
  })
})

// 文字以外の見分け（T4-5b のレビュー）。選択中の背景と浮いた面が、どの地の上でも見分けられる
const grounds = ['bg', 'bg-production', 'bg-development', 'bg-testing', 'bg-custom']
describe.each([
  ['ライト', light],
  ['ダーク', dark]
])('地との見分け（%s）', (_name, theme) => {
  it.each(grounds)('選択中の背景と %s の明るさの差は 1.15 以上', (g) => {
    expect(contrast(theme['selected']!, theme[g]!)).toBeGreaterThanOrEqual(1.15)
  })

  it.each(grounds)('浮いた面（surface）と %s の明るさの差は 1.08 以上', (g) => {
    expect(contrast(theme['surface']!, theme[g]!)).toBeGreaterThanOrEqual(1.08)
  })

  it.each(['production', 'development', 'testing', 'custom'])(
    'bg-%s は、素の地に Mode 色を 7% 混ぜた色（SPEC 8章）',
    (m) => {
      const ch = (hex: string, i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
      for (const i of [0, 1, 2]) {
        const mixed = ch(theme['bg']!, i) * 0.93 + ch(theme[`mode-${m}`]!, i) * 0.07
        expect(Math.abs(ch(theme[`bg-${m}`]!, i) - mixed)).toBeLessThanOrEqual(1)
      }
    }
  )
})
