import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 書体と文字の大きさ（SPEC 8章、ADR-009）。どの OS でも同梱の IBM Plex で表示する
const css = readFileSync(join(__dirname, 'main.css'), 'utf8')
const entry = readFileSync(join(__dirname, '..', 'main.tsx'), 'utf8')
const root = /^:root \{([^}]*)\}/m.exec(css)![1]!
// :root の外（部品ごとの指定）
const rules = css.slice(css.indexOf('}', css.indexOf(':root {')) + 1)

function token(name: string): string | undefined {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(root)?.[1]?.trim()
}

describe('書体', () => {
  it('UI は IBM Plex Sans JP、等幅は IBM Plex Mono で、日本語は IBM Plex Sans JP に落ちる', () => {
    expect(token('font-ui')).toMatch(/^'IBM Plex Sans JP',/)
    expect(token('font-mono')).toMatch(/^'IBM Plex Mono', 'IBM Plex Sans JP',/)
  })

  it('入口で、使う太さの書体ファイルを読み込む（ネットワークから取りに行かない）', () => {
    for (const w of ['400', '700']) {
      expect(entry).toContain(`import '@fontsource/ibm-plex-sans-jp/${w}.css'`)
    }
    expect(entry).toContain(`import '@fontsource/ibm-plex-mono/400.css'`)
  })

  it('部品では書体を直接書かず、変数を通す', () => {
    const families = [...rules.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1]!.trim())
    expect(families.length).toBeGreaterThan(0)
    for (const f of families) expect(f).toMatch(/^var\(--font-(ui|mono)\)$/)
    // 一括指定（font:）で書体を書くと上の検査から漏れるので、inherit だけにする
    for (const m of rules.matchAll(/\bfont:\s*([^;]+);/g)) expect(m[1]!.trim()).toBe('inherit')
  })

  it('URL の欄は等幅（1 と l、0 と O を見分けやすくする）', () => {
    expect(rules).toMatch(/\.address-bar input \{[^}]*font-family: var\(--font-mono\);/)
  })
})

describe('文字の大きさ', () => {
  it('部品では px を直接書かず、:root の段（--font-size-*）を通す', () => {
    const sizes = [...rules.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]!.trim())
    expect(sizes.length).toBeGreaterThan(0)
    for (const s of sizes) {
      expect(s).toMatch(/^var\(--font-size-[a-z]+\)$/)
      expect(token(s.slice(6, -1)), s).toMatch(/^\d+px$/)
    }
  })

  it('ダウンロードの数字は幅をそろえる（進み具合が変わっても横にずれない）', () => {
    expect(rules).toMatch(/\.download-state \{[^}]*font-variant-numeric: tabular-nums;/)
  })
})
