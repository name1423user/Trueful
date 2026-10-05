import { expect, test, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { appWindow, launchApp } from './launchApp'

let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.setHeader('set-cookie', 'sid=1; Max-Age=86400; Path=/')
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

const create = (window: Page, name: string): Promise<{ ws: number; tab: number }> =>
  window.evaluate(async (n) => {
    const api = (window as unknown as Api).trueful
    const r = await api.workspace.create({
      name: n,
      mode: 'custom',
      requestId: crypto.randomUUID()
    })
    if (!r.ok) throw new Error(r.error.message)
    await api.view.setBounds({ x: 0, y: 80, width: 800, height: 600 })
    const tabs = await api.tab.list(r.value.id)
    if (!tabs.ok || tabs.value.activeId === null) throw new Error('タブがない')
    return { ws: r.value.id, tab: tabs.value.activeId }
  }, name)

const del = (window: Page, id: number): Promise<unknown> =>
  window.evaluate((i) => (window as unknown as Api).trueful.workspace.delete(i), id)

const list = (window: Page): Promise<{ ids: number[]; currentId: number | null }> =>
  window.evaluate(async () => {
    const r = await (window as unknown as Api).trueful.workspace.list()
    if (!r.ok) throw new Error(r.error.message)
    return { ids: r.value.workspaces.map((w) => w.id), currentId: r.value.currentId }
  })

const pageCount = (app: Awaited<ReturnType<typeof launchApp>>['app']): Promise<number> =>
  app.evaluate(
    ({ webContents }, o) =>
      webContents.getAllWebContents().filter((wc) => !wc.isDestroyed() && wc.getURL().startsWith(o))
        .length,
    origin
  )

test('Workspace を削除すると、ページとフォルダが消え、今の Workspace なら残りの1つへ移る。ない id は not-found', async () => {
  const { app, userDataDir, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    const a = await create(window, 'A')
    const b = await create(window, 'B')
    await window.evaluate(
      async ([w, t, u]) => {
        const r = await (window as unknown as Api).trueful.tab.navigate(w, t, u)
        if (!r.ok) throw new Error(r.error.message)
      },
      [b.ws, b.tab, `${origin}/b`] as const
    )
    await expect.poll(() => pageCount(app), { timeout: 15_000 }).toBe(1)
    expect(existsSync(join(userDataDir, 'workspaces', String(a.ws)))).toBe(true)

    // 今の Workspace（B）を消すと、残りの A が今の Workspace になる。B のページは消える
    expect(await del(window, b.ws)).toMatchObject({ ok: true, value: { currentId: a.ws } })
    expect(await list(window)).toEqual({ ids: [a.ws], currentId: a.ws })
    await expect.poll(() => pageCount(app)).toBe(0)

    // 今でない Workspace を消す。フォルダは片付けて消える
    const c = await create(window, 'C')
    expect(await del(window, a.ws)).toMatchObject({ ok: true, value: { currentId: c.ws } })
    await expect.poll(() => existsSync(join(userDataDir, 'workspaces', String(a.ws)))).toBe(false)
    expect(existsSync(join(userDataDir, 'workspaces', '.trash'))).toBe(false)

    // ない id、不正な引数
    expect(await del(window, 9999)).toMatchObject({ ok: false, error: { code: 'not-found' } })
    expect(await del(window, 0)).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
  } finally {
    await app.close()
    cleanup()
  }
})
