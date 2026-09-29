import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { appWindow, launchApp } from './launchApp'

// テスト用のページ（ローカルの HTTP サーバー）。/tall は縦に長く、スクロールできる
let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><title>page ${req.url}</title><div style="height:5000px">tall</div>`)
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

const createWorkspace = (window: Page, name: string): Promise<number> =>
  window.evaluate(async (n) => {
    const api = (window as unknown as Api).trueful
    const r = await api.workspace.create({
      name: n,
      mode: 'custom',
      requestId: crypto.randomUUID()
    })
    if (!r.ok) throw new Error(r.error.message)
    return r.value.id
  }, name)

const statuses = (window: Page): Promise<Record<string, string>> =>
  window.evaluate(async () => {
    const r = await (window as unknown as Api).trueful.workspace.list()
    if (!r.ok) throw new Error(r.error.message)
    return Object.fromEntries(r.value.workspaces.map((w) => [w.name, w.status]))
  })

const firstTab = (window: Page, ws: number): Promise<{ id: number; scrollY: number }> =>
  window.evaluate(async (w) => {
    const r = await (window as unknown as Api).trueful.tab.list(w)
    if (!r.ok) throw new Error(r.error.message)
    return r.value.tabs[0]!
  }, ws)

// /tall を表示しているページのスクロール位置（ページがなければ undefined）
const pageScrollY = (app: ElectronApplication): Promise<number | undefined> =>
  app.evaluate(async ({ webContents }, o) => {
    const page = webContents
      .getAllWebContents()
      .find((wc) => !wc.isDestroyed() && wc.getURL() === `${o}/tall`)
    return page ? ((await page.executeJavaScript('Math.round(scrollY)')) as number) : undefined
  }, origin)

test('6 個目の Workspace で、いちばん長く使っていないものが休止してページが消え、選ぶと復帰して URL とスクロール位置が戻る', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    const w1 = await createWorkspace(window, 'W1')
    await window.evaluate(() =>
      (window as unknown as Api).trueful.view.setBounds({ x: 0, y: 80, width: 800, height: 600 })
    )
    const tab = await firstTab(window, w1)
    await window.evaluate(
      async ([w, t, u]) => {
        const r = await (window as unknown as Api).trueful.tab.navigate(w, t, u)
        if (!r.ok) throw new Error(r.error.message)
      },
      [w1, tab.id, `${origin}/tall`] as const
    )
    await expect.poll(() => pageScrollY(app)).toBe(0)
    await app.evaluate(({ webContents }, o) => {
      const page = webContents.getAllWebContents().find((wc) => wc.getURL() === `${o}/tall`)
      return page?.executeJavaScript('scrollTo(0, 800)')
    }, origin)
    await expect.poll(() => pageScrollY(app)).toBe(800)

    // 5 個目までは休止しない
    for (const name of ['W2', 'W3', 'W4', 'W5']) await createWorkspace(window, name)
    expect(Object.values(await statuses(window)).every((s) => s === 'active')).toBe(true)
    expect(await pageScrollY(app)).toBe(800)

    // 6 個目で W1 が休止する。ページは消え、スクロール位置が記録される
    await createWorkspace(window, 'W6')
    expect(await statuses(window)).toMatchObject({ W1: 'dormant', W2: 'active', W6: 'active' })
    await expect.poll(() => pageScrollY(app)).toBeUndefined()
    await expect.poll(async () => (await firstTab(window, w1)).scrollY).toBe(800)

    // W1 を選ぶと復帰し、代わりに W2 が休止する。同じ URL を読み込み、スクロール位置が戻る
    await window.evaluate(async (w) => {
      const r = await (window as unknown as Api).trueful.workspace.switch(w)
      if (!r.ok) throw new Error(r.error.message)
    }, w1)
    expect(await statuses(window)).toMatchObject({ W1: 'active', W2: 'dormant' })
    await expect.poll(() => pageScrollY(app)).toBe(800)
    // 戻したら記録は 0 にする（次にページを作り直したときに、古い位置へ飛ばない）
    expect((await firstTab(window, w1)).scrollY).toBe(0)
  } finally {
    await app.close()
    cleanup()
  }
})
