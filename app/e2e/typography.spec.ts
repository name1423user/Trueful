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
      // load() は、その文字の表示に使う、同梱の書体（@font-face）を読み込んで返す
      const families = async (font: string, text: string): Promise<string[]> =>
        (await document.fonts.load(font, text)).map((f) => f.family.replace(/"/g, ''))
      return {
        body: getComputedStyle(document.body).fontFamily,
        uiJa: await families(`13px ${ui}`, 'あ漢'),
        uiBold: await families(`700 13px ${ui}`, 'A'),
        monoLatin: await families(`13px ${mono}`, '0O'),
        monoJa: await families(`13px ${mono}`, 'あ')
      }
    })
    expect(result.body).toMatch(/^"?IBM Plex Sans JP"?,/)
    expect(result.uiJa).toContain('IBM Plex Sans JP')
    expect(result.uiBold).toContain('IBM Plex Sans JP')
    expect(result.monoLatin).toContain('IBM Plex Mono')
    expect(result.monoJa).toContain('IBM Plex Sans JP')
  } finally {
    await app.close()
    cleanup()
  }
})
