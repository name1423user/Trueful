import { expect, test } from '@playwright/test'
import { appWindow, launchApp } from './launchApp'

// SPEC 8章・ADR-009: どの OS でも、同梱の IBM Plex で表示する（OS に入っている書体に頼らない）
test('UI は同梱の IBM Plex Sans JP で、等幅の欄の日本語も IBM Plex Sans JP で表示される', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    const result = await window.evaluate(async () => {
      const style = getComputedStyle(document.documentElement)
      const ui = style.getPropertyValue('--font-ui').trim()
      const mono = style.getPropertyValue('--font-mono').trim()
      // load() は、その文字の表示に使う、同梱の書体（@font-face）を読み込んで返す。
      // 指定の太さの面がないと近い太さの面を返すので、太さと読み込みの結果まで見る
      const faces = async (font: string, text: string): Promise<string[]> =>
        (await document.fonts.load(font, text)).map(
          (f) => `${f.family.replace(/"/g, '')}/${f.weight}/${f.status}`
        )
      const result = {
        body: getComputedStyle(document.body).fontFamily,
        uiJa: await faces(`13px ${ui}`, 'あ漢'),
        uiBold: await faces(`700 13px ${ui}`, 'A'),
        monoLatin: await faces(`13px ${mono}`, '0O'),
        monoJa: await faces(`13px ${mono}`, 'あ')
      }
      // すべての面を読み込み、読めなかった面（CSP で止められた data: の書体など）がないことを確かめる
      await Promise.allSettled([...document.fonts].map((f) => f.load()))
      const failed = [...document.fonts]
        .filter((f) => f.status === 'error')
        .map((f) => `${f.family}/${f.weight}/${f.unicodeRange.slice(0, 20)}`)
      return { ...result, failed }
    })
    expect(result.body).toMatch(/^"?IBM Plex Sans JP"?,/)
    expect(result.uiJa).toContain('IBM Plex Sans JP/400/loaded')
    expect(result.uiBold).toContain('IBM Plex Sans JP/700/loaded')
    expect(result.monoLatin).toContain('IBM Plex Mono/400/loaded')
    expect(result.monoJa).toContain('IBM Plex Sans JP/400/loaded')
    expect(result.failed).toEqual([])
    // 3 OS で同じ見た目になっているかを、CI の成果物で見比べる
    await window.screenshot({ path: `test-results/typography-${process.platform}.png` })
  } finally {
    await app.close()
    cleanup()
  }
})
