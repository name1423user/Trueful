import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { launchApp } from './launchApp'

let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><title>page ${req.url}</title><body>${req.url}</body>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

test('タブを別の Workspace へ移す: 移動先に同じ URL のタブができ、元からは消える。今の Workspace は変わらず、画面のタブ列に出る', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    const r = await window.evaluate(async (url) => {
      const { workspace, tab } = (window as unknown as { trueful: Window['trueful'] }).trueful
      const make = async (name: string, mode: 'development' | 'production'): Promise<number> => {
        const created = await workspace.create({ name, mode, requestId: crypto.randomUUID() })
        if (!created.ok) throw new Error(created.error.message)
        return created.value.id
      }
      const a = await make('案件A', 'development')
      const b = await make('案件B', 'production')
      // B が今の Workspace。A に URL のタブを開く（A のタブとして操作する）
      const first = await tab.list(a)
      if (!first.ok) throw new Error(first.error.message)
      const opened = await tab.navigate(a, first.value.tabs[0]!.id, url)
      if (!opened.ok) throw new Error(opened.error.message)
      // タイトルが記録されるのを待つ（移すと、そのタイトルが引き継がれる）
      for (let i = 0; i < 100; i++) {
        const listed = await tab.list(a)
        if (listed.ok && listed.value.tabs[0]?.title) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      const moved = await tab.move(a, opened.value.id, b)
      return {
        moved,
        fromA: await tab.list(a),
        toB: await tab.list(b),
        same: await tab.move(b, moved.ok ? moved.value.id : 0, b),
        wrongOwner: await tab.move(a, moved.ok ? moved.value.id : 0, b),
        missingTarget: await tab.move(b, moved.ok ? moved.value.id : 0, 9999),
        a,
        b
      }
    }, `${origin}/moved`)
    expect(r.moved).toMatchObject({ ok: true, value: { workspaceId: r.b, url: `${origin}/moved` } })
    // 元の Workspace には、空のタブが1つだけ残る
    expect(r.fromA.ok && r.fromA.value.tabs.map((t) => t.url)).toEqual(['about:blank'])
    expect(r.toB.ok && r.toB.value.tabs.map((t) => t.url)).toContain(`${origin}/moved`)
    expect(r.toB.ok && r.toB.value.activeId).toBe(r.moved.ok && r.moved.value.id)
    expect(r.same).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
    expect(r.wrongOwner).toMatchObject({ ok: false, error: { code: 'not-found' } })
    expect(r.missingTarget).toMatchObject({ ok: false, error: { code: 'not-found' } })

    // 今の Workspace は B のまま。移動先が今の Workspace なら、タブ列にすぐ出て、選ばれている
    await expect(window.getByText('今の Workspace: 案件B')).toBeVisible()
    await expect(window.locator('.tab-row[aria-current="true"]')).toHaveText('page /moved')
  } finally {
    await app.close()
    cleanup()
  }
})
