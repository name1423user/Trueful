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
    // 準備は画面で行う（A で URL を開き、B を作る。B が今の Workspace になる）
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    await address.fill(`${origin}/moved`)
    await address.press('Enter')
    const tabs = window.locator('.tab-row')
    await expect(tabs.first()).toHaveText('page /moved')
    await window.getByRole('button', { name: 'Workspace を追加' }).click()
    await window.getByLabel('名前').fill('案件B')
    await window.getByLabel('Production（本番）').check()
    await window.getByRole('button', { name: '作成' }).click()
    const rows = window.locator('.workspace-row')
    await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')

    // 移す（右クリックのメニューは T2-6b。ここでは preload の API を呼ぶ）
    const r = await window.evaluate(async () => {
      const { workspace, tab } = (window as unknown as { trueful: Window['trueful'] }).trueful
      const listed = await workspace.list()
      if (!listed.ok) throw new Error(listed.error.message)
      const [a, b] = listed.value.workspaces.map((w) => w.id) as [number, number]
      const fromA = await tab.list(a)
      if (!fromA.ok) throw new Error(fromA.error.message)
      const id = fromA.value.tabs[0]!.id
      const moved = await tab.move(a, id, b)
      const movedId = moved.ok ? moved.value.id : 0
      return {
        a,
        b,
        moved,
        fromA: await tab.list(a),
        toB: await tab.list(b),
        same: await tab.move(b, movedId, b),
        wrongOwner: await tab.move(a, movedId, b),
        missingTarget: await tab.move(b, movedId, 9999)
      }
    })
    expect(r.moved).toMatchObject({ ok: true, value: { workspaceId: r.b, url: `${origin}/moved` } })
    // 元の Workspace には、空のタブが1つだけ残る
    expect(r.fromA.ok && r.fromA.value.tabs.map((t) => t.url)).toEqual(['about:blank'])
    expect(r.toB.ok && r.toB.value.tabs.map((t) => t.url)).toContain(`${origin}/moved`)
    expect(r.toB.ok && r.toB.value.activeId).toBe(r.moved.ok && r.moved.value.id)
    expect(r.same).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
    expect(r.wrongOwner).toMatchObject({ ok: false, error: { code: 'not-found' } })
    expect(r.missingTarget).toMatchObject({ ok: false, error: { code: 'not-found' } })

    // 今の Workspace は B のまま。移動先が今の Workspace なので、タブ列にすぐ出て、選ばれている
    await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')
    await expect(tabs.filter({ hasText: 'page /moved' })).toHaveAttribute('aria-current', 'true')
    // 元の A を開くと、空のタブだけ
    await rows.nth(0).click()
    await expect(tabs).toHaveCount(1)
    await expect(tabs.first()).toHaveText('新しいタブ')
  } finally {
    await app.close()
    cleanup()
  }
})
