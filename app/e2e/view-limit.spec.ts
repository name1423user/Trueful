import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { appWindow, launchApp } from './launchApp'

// テスト用のページ（ローカルの HTTP サーバー。外のネットワークには出ない）
let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><title>page ${req.url}</title>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
test.afterAll(
  () =>
    new Promise<void>((resolve) => {
      // Electron が残した keep-alive の接続で、閉じるのを待ち続けないように
      server.closeAllConnections()
      server.close(() => resolve())
    })
)

test('ページの実体が上限を超えたら、いちばん長く見ていないタブを破棄して薄く出し、選ぶと読み込み直す', async () => {
  // 上限（本来は 30 個）を 2 個にして確かめる。境界の値は単体テスト（viewLimit.test.ts）で見る
  const { app, cleanup } = await launchApp(undefined, { env: { TRUEFUL_MAX_PAGE_VIEWS: '2' } })
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()

    const tabs = window.locator('.tab-row')
    const address = window.getByLabel('アドレス')
    const open = async (path: string): Promise<void> => {
      await address.fill(`${origin}${path}`)
      await address.press('Enter')
    }
    // 1つ目のタブで /a を開き、2つ目・3つ目のタブを作る（3つ目で上限を超える）
    await open('/a')
    await expect(tabs.nth(0)).toHaveText('page /a')
    await window.locator('.tab-new').click()
    await open('/b')
    await expect(tabs.nth(1)).toHaveText('page /b')
    await expect(tabs.nth(0)).not.toHaveClass(/tab-discarded/)
    await window.locator('.tab-new').click()
    await expect(tabs).toHaveCount(3)

    // いちばん長く見ていない1つ目が破棄される。並びとタイトルはそのまま
    await expect(tabs.nth(0)).toHaveClass(/tab-discarded/)
    await expect(tabs.nth(0)).toContainText('page /a')
    await expect(tabs.nth(1)).not.toHaveClass(/tab-discarded/)
    await window.screenshot({ path: `test-results/view-limit-${process.platform}.png` })

    // 選ぶと同じ URL で作り直す。代わりに、いま長く見ていない2つ目が破棄される
    await tabs.nth(0).click()
    await expect(tabs.nth(0)).not.toHaveClass(/tab-discarded/)
    await expect(address).toHaveValue(`${origin}/a`)
    await expect(tabs.nth(1)).toHaveClass(/tab-discarded/)
    // 残っているページの実体は、作り直した1つ目だけ（読み込みの確定を待つ）
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, o) =>
            webContents
              .getAllWebContents()
              .filter((wc) => !wc.isDestroyed())
              .map((wc) => wc.getURL())
              .filter((u) => u.startsWith(o)),
          origin
        )
      )
      .toEqual([`${origin}/a`])
  } finally {
    await app.close()
    cleanup()
  }
})
