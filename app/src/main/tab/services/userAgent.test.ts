import { describe, expect, it } from 'vitest'
import { pageUserAgent } from './userAgent'

describe('ページに送る User-Agent', () => {
  it('Electron/<版> だけを除く（Google が簡易版のログイン画面にしないため。T0-1）', () => {
    const original =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'trueful/0.1.0 Chrome/152.0.7977.130 Electron/44.4.5 Safari/537.36'
    expect(pageUserAgent(original)).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'trueful/0.1.0 Chrome/152.0.7977.130 Safari/537.36'
    )
  })

  it('Electron/ がなければそのまま。何度通しても同じ', () => {
    const plain = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/152.0.0.0 Safari/537.36'
    expect(pageUserAgent(plain)).toBe(plain)
    const once = pageUserAgent('a Chrome/1 Electron/44.4.5 Safari/1')
    expect(pageUserAgent(once)).toBe(once)
  })
})
