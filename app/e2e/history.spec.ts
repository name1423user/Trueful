import { expect, test, type Page } from '@playwright/test'
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

const search = (window: Page, query: string): Promise<{ url: string; title: string }[]> =>
  window.evaluate(async (q) => {
    const r = await (window as unknown as Api).trueful.history.search({ query: q })
    if (!r.ok) throw new Error(r.error.message)
    return r.value.map((e) => ({ url: e.url, title: e.title }))
  }, query)

test('開いたページの URL とタイトルが履歴に残り、検索でき、全部消せる。about:blank は残らない', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    for (const path of ['/alpha', '/beta']) {
      await address.fill(`${origin}${path}`)
      await address.press('Enter')
      await expect
        .poll(() => search(window, `page ${path}`), { timeout: 15_000 })
        .toEqual([{ url: `${origin}${path}`, title: `page ${path}` }])
    }
    // 新しい順。about:blank（最初の空のタブ）は残らない
    expect((await search(window, 'page')).map((e) => e.url)).toEqual([
      `${origin}/beta`,
      `${origin}/alpha`
    ])
    expect(await search(window, 'about:blank')).toEqual([])

    // 全部消す
    const removed = await window.evaluate(async () => {
      const r = await (window as unknown as Api).trueful.history.delete({})
      if (!r.ok) throw new Error(r.error.message)
      return r.value.removed
    })
    expect(removed).toBe(2)
    expect(await search(window, 'page')).toEqual([])
  } finally {
    await app.close()
    cleanup()
  }
})
