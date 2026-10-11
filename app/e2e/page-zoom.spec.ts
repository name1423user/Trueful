import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { appWindow, launchApp } from './launchApp'

let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><title>page ${req.url}</title><p>zoom</p>`)
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

test('ページの拡大・縮小（F02）: メニューで段階ごとに変わり、実際のサイズで戻る。UI の倍率は変えない', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    await address.fill(`${origin}/zoom`)
    await address.press('Enter')
    await expect(window.locator('.tab-row').first()).toHaveText('page /zoom', { timeout: 15_000 })

    const click = (id: string): Promise<void> =>
      app.evaluate(({ Menu }, id) => Menu.getApplicationMenu()!.getMenuItemById(id)!.click(), id)
    const factors = (): Promise<{ page: number | undefined; ui: number | undefined }> =>
      app.evaluate(({ webContents }, prefix) => {
        const all = webContents.getAllWebContents()
        return {
          page: all.find((wc) => wc.getURL().startsWith(prefix))?.getZoomFactor(),
          ui: all.find((wc) => !wc.getURL().startsWith('http://127.0.0.1'))?.getZoomFactor()
        }
      }, origin)

    await click('page-zoom-in')
    await click('page-zoom-in')
    await expect.poll(async () => (await factors()).page).toBe(1.25)
    await click('page-zoom-out')
    await expect.poll(async () => (await factors()).page).toBe(1.1)
    expect((await factors()).ui).toBe(1)
    await click('page-zoom-reset')
    await expect.poll(async () => (await factors()).page).toBe(1)

    // ページにフォーカスがあるときの Cmd/Ctrl + =（ページ側で受ける）
    await app.evaluate(({ webContents }, prefix) => {
      const page = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith(prefix))!
      page.focus()
      const modifiers = [process.platform === 'darwin' ? 'meta' : 'control'] as (
        'meta' | 'control'
      )[]
      page.sendInputEvent({ type: 'keyDown', keyCode: '=', modifiers })
    }, origin)
    await expect.poll(async () => (await factors()).page).toBe(1.1)
  } finally {
    await app.close()
    cleanup()
  }
})
