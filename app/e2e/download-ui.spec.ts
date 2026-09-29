import { expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appWindow, launchApp } from './launchApp'

let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/octet-stream')
    if (req.url === '/slow') {
      // 途中で止めたまま閉じない（進行中の表示と、一時停止・再開・取り消しを確かめるため）
      res.setHeader('content-disposition', 'attachment; filename="slow.bin"')
      res.setHeader('content-length', '1000000')
      res.write(Buffer.alloc(1000, 1))
      return
    }
    res.setHeader('content-disposition', 'attachment; filename="done.txt"')
    res.end('hello')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
test.afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
)

test('ダウンロードの画面: 完了は「フォルダで表示」、進行中は進捗と、一時停止・取り消し', async () => {
  test.setTimeout(90_000)
  const downloads = mkdtempSync(join(tmpdir(), 'trueful-e2e-dlui-'))
  const { app, cleanup } = await launchApp(undefined, { env: { TRUEFUL_DOWNLOADS_DIR: downloads } })
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    await window.getByRole('button', { name: 'ダウンロード', exact: true }).click()
    await expect(window.getByText('ダウンロードはまだありません')).toBeVisible()

    // 完了したもの: 状態は文字、操作は「フォルダで表示」だけ
    await address.fill(`${origin}/done`)
    await address.press('Enter')
    const done = window.locator('.download-item', { hasText: 'done.txt' })
    await expect(done.locator('.download-state')).toContainText('完了', { timeout: 20_000 })
    await expect(done.getByRole('button', { name: /をフォルダで表示$/ })).toBeVisible()
    await expect(done.getByRole('button', { name: /を一時停止$/ })).toHaveCount(0)

    // 進行中のもの: 進捗（<progress>）と、一時停止・取り消し
    await address.fill(`${origin}/slow`)
    await address.press('Enter')
    const slow = window.locator('.download-item', { hasText: 'slow.bin' })
    await expect(slow.locator('.download-state')).toContainText('ダウンロード中', {
      timeout: 20_000
    })
    await expect(slow.getByRole('progressbar')).toBeVisible()
    await window.screenshot({ path: `test-results/download-ui-${process.platform}.png` })

    // 一時停止の状態が反映されてから、取り消す。
    // 再開は、サーバーが途中からの再開に対応していないと canResume が false になる（OS によって違う）ので、
    // ここでは確かめない（単体テストの偽の DownloadItem と、実機で確かめる）
    await slow.getByRole('button', { name: /を一時停止$/ }).click()
    await expect(slow.locator('.download-state')).toContainText('一時停止')
    await expect(slow.getByRole('button', { name: /を再開$/ })).toBeVisible()
    await slow.getByRole('button', { name: /を取り消し$/ }).click()
    await expect(slow.locator('.download-state')).toContainText('取り消しました', {
      timeout: 20_000
    })
    await expect(slow.getByRole('button')).toHaveCount(0)
  } finally {
    await app.close()
    cleanup()
    rmSync(downloads, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
