import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { launchApp } from './launchApp'

// テスト用のページ（ローカルの HTTP サーバー。外のネットワークには出ない）
let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(
      `<!doctype html><title>page ${req.url}</title>` +
        `<body style="background:#fde68a"><h1>Trueful test page ${req.url}</h1></body>`
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

test('アドレスバーで開き、タブ列から作る・選ぶ・閉じる。ページは中央の場所に重なる', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()

    // 作ると空のタブが1つ。アドレスバーに URL を打って Enter で開く
    const tabs = window.locator('.tab-row')
    await expect(tabs).toHaveCount(1)
    const address = window.getByLabel('アドレス')
    await address.fill(`${origin}/a`)
    await address.press('Enter')
    await expect(tabs.first()).toHaveText('page /a')
    await expect(address).toHaveValue(`${origin}/a`)

    // ページの WebContentsView は、中央の空の div と同じ位置・大きさに置かれる
    const area = await window.getByTestId('page-area').boundingBox()
    const viewBounds = await app.evaluate(({ BrowserWindow }) => {
      const views = BrowserWindow.getAllWindows()[0]!.contentView.children
      return views.at(-1)?.getBounds()
    })
    expect(viewBounds).toEqual({
      x: Math.round(area!.x),
      y: Math.round(area!.y),
      width: Math.round(area!.width),
      height: Math.round(area!.height)
    })

    // 2つ目のページへ進み、戻るボタンで戻る
    await address.fill(`${origin}/b`)
    await address.press('Enter')
    await expect(tabs.first()).toHaveText('page /b')
    await window.getByRole('button', { name: '戻る' }).click()
    await expect(tabs.first()).toHaveText('page /a')

    // タブ列の「新しいタブ」で作り、元のタブを選び直し、新しいタブを閉じる
    await window.getByRole('button', { name: '新しいタブ' }).click()
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'true')
    await expect(address).toHaveValue('')
    await tabs.first().click()
    await expect(tabs.first()).toHaveAttribute('aria-current', 'true')
    await expect(address).toHaveValue(`${origin}/a`)
    await window.getByRole('button', { name: '新しいタブ を閉じる' }).click()
    await expect(tabs).toHaveCount(1)

    // メニューの Cmd/Ctrl+L でアドレスバーにフォーカスする
    await window.getByRole('button', { name: '戻る' }).focus()
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.getMenuItemById('focus-address-bar')?.click()
    )
    // CI ではウィンドウが前面にないことがあり toBeFocused は使えないので、activeElement を見る
    await expect
      .poll(() => window.evaluate(() => document.activeElement?.getAttribute('name')))
      .toBe('address')

    // スクリーンショット: UI（Playwright）と、その上に重なるページ（WebContentsView は別に撮る）
    await window.screenshot({ path: `test-results/tab-ui-${process.platform}.png` })
    const page = await app.evaluate(async ({ webContents }, o) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith(o))
      return (await wc?.capturePage())?.toPNG().toString('base64')
    }, origin)
    if (page) {
      writeFileSync(`test-results/tab-ui-page-${process.platform}.png`, Buffer.from(page, 'base64'))
    }
  } finally {
    await app.close()
    cleanup()
  }
})
