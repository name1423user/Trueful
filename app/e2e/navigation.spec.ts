import { expect, test } from '@playwright/test'
import { launchApp } from './launchApp'

test('UI のウィンドウは、自分の画面の外へ移動しない', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    await expect(window.locator('header.top-bar')).toBeVisible()
    const before = window.url()

    // 外部の http(s) は既定のブラウザに渡すので、E2E では openExternal を差し替えて呼ばれたかだけ見る
    await app.evaluate(({ shell }) => {
      const g = globalThis as { opened?: string[] }
      g.opened = []
      shell.openExternal = async (url: string) => {
        g.opened!.push(url)
      }
    })

    // 先に file:// へ移動させ、次に https へ移動させる。移動の要求は順に処理されるので、
    // https が openExternal に届いた時点で、file:// の移動も止め終わっている
    await window.evaluate(() => {
      location.href = 'file:///etc/hosts'
    })
    await window.evaluate(() => {
      location.href = 'https://example.com/'
    })
    await expect
      .poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened))
      .toEqual(['https://example.com/'])
    // 止めた移動のあと、Playwright の locator は「移動の完了待ち」のままになるので、Main 側から確かめる
    const after = await app.evaluate(async ({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents
      const hasTopBar: boolean = await wc.executeJavaScript(
        "document.querySelector('header.top-bar') !== null"
      )
      return { url: wc.getURL(), hasTopBar }
    })
    expect(after).toEqual({ url: before, hasTopBar: true })
  } finally {
    await app.close()
    cleanup()
  }
})
