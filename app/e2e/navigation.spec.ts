import { _electron as electron, expect, test } from '@playwright/test'

test('UI のウィンドウは、自分の画面の外へ移動しない', async () => {
  const app = await electron.launch({ args: ['.'] })
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

    await window.evaluate(() => {
      location.href = 'https://example.com/'
    })
    await window.evaluate(() => {
      location.href = 'file:///etc/hosts'
    })
    await expect
      .poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened))
      .toEqual(['https://example.com/'])
    expect(window.url()).toBe(before)
    await expect(window.locator('header.top-bar')).toBeVisible()
  } finally {
    await app.close()
  }
})
