import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { appWindow, launchApp } from './launchApp'

let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><title>React 入門 ${req.url}</title>`)
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

test('統合検索欄の候補（IPC）: 開いたページはタブと履歴から見つかり、最後は Web 検索。不正な引数は拒否', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    await address.fill(`${origin}/learn`)
    await address.press('Enter')
    await expect(window.locator('.tab-row').first()).toHaveText('React 入門 /learn', {
      timeout: 15_000
    })

    const result = await window.evaluate(async () => {
      const api = (window as unknown as Api).trueful
      const list = await api.workspace.list()
      const id = list.ok ? list.value.currentId : null
      const found = await api.omnibox.suggest('react', id)
      const bad = await api.omnibox.suggest('a'.repeat(3000), id)
      return { found, bad }
    })
    expect(result.found.ok && result.found.value.map((c) => c.kind)).toEqual(['tab', 'search'])
    expect(result.found.ok && result.found.value[0]).toMatchObject({
      title: 'React 入門 /learn',
      url: `${origin}/learn`
    })
    expect(result.bad).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
  } finally {
    await app.close()
    cleanup()
  }
})
