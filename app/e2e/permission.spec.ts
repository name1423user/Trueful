import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { appWindow, launchApp } from './launchApp'

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
      server.closeAllConnections()
      server.close(() => resolve())
    })
)

type Api = { trueful: Window['trueful'] }

test('決めていない権限（位置情報）は拒否され、記憶しない。一覧は空で、ない記憶の取り消しは false、不正な引数は拒否', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    await address.fill(`${origin}/geo`)
    await address.press('Enter')
    await expect(window.locator('.tab-row').first()).toHaveText('page /geo', { timeout: 15_000 })

    // ページが位置情報を求める → 確認の画面ができるまでは、拒否（PERMISSION_DENIED = 1）
    const code = await app.evaluate(async ({ webContents }, o) => {
      const page = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith(o))
      return page?.executeJavaScript(
        `new Promise((resolve) => navigator.geolocation.getCurrentPosition(() => resolve('allowed'), (e) => resolve(e.code)))`,
        true
      )
    }, origin)
    expect(code).toBe(1)

    const result = await window.evaluate(async () => {
      const api = (window as unknown as Api).trueful.permission
      const list = await api.list()
      const revoke = await api.revoke({
        workspaceId: 1,
        origin: 'https://a.example',
        permission: 'camera'
      })
      const bad = await api.revoke({
        workspaceId: 1,
        origin: 'file:///x',
        permission: 'camera'
      })
      return { list, revoke, bad }
    })
    expect(result.list).toMatchObject({ ok: true, value: [] })
    expect(result.revoke).toMatchObject({ ok: true, value: false })
    expect(result.bad).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
  } finally {
    await app.close()
    cleanup()
  }
})
