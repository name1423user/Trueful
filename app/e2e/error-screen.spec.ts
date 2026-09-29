import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { appWindow, launchApp } from './launchApp'

const listen = (port: number): Promise<Server> =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(`<!doctype html><title>page ${req.url}</title>`)
    })
    server.listen(port, '127.0.0.1', () => resolve(server))
  })

test('接続できないと、原因と次の操作を書いたエラー画面が出る。再読み込みで直り、画面が消える', async () => {
  // 空いている番号を取り、いったん閉じる（接続が拒否される）
  const probe = await listen(0)
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>((resolve) => probe.close(() => resolve()))

  const { app, cleanup } = await launchApp()
  let server: Server | undefined
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    await address.fill(`http://127.0.0.1:${port}/`)
    await address.press('Enter')

    const screen = window.locator('.error-screen')
    await expect(screen.getByRole('heading', { name: 'ページを読み込めませんでした' })).toBeVisible(
      {
        timeout: 20_000
      }
    )
    await expect(screen).toContainText(`http://127.0.0.1:${port}/`)
    await expect(screen.getByRole('button', { name: '再読み込み' })).toBeVisible()
    // 前のページ（空のタブ）に戻れる
    await expect(screen.getByRole('button', { name: '戻る' })).toBeEnabled()
    await window.screenshot({ path: `test-results/error-screen-${process.platform}.png` })

    // サイトが復活したら、再読み込みで直る（エラー画面が消え、ページが出る）
    server = await listen(port)
    await screen.getByRole('button', { name: '再読み込み' }).click()
    await expect(window.locator('.error-screen')).toHaveCount(0, { timeout: 20_000 })
    await expect(window.locator('.tab-row').first()).toHaveText('page /', { timeout: 20_000 })
  } finally {
    await app.close()
    cleanup()
    server?.closeAllConnections()
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  }
})
