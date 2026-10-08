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

test('タブの右クリックメニュー「Workspaceへ移動」: 確認（ログインが変わる。今後表示しない）を経て移り、2回目は確認なし。キーボードだけでもできる', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    await address.fill(`${origin}/m1`)
    await address.press('Enter')
    const tabs = window.locator('.tab-row')
    await expect(tabs.first()).toHaveText('page /m1')
    // 移動先がまだないとき: メニューは「移動先がない」と出す
    await tabs.first().click({ button: 'right' })
    const menu = window.getByRole('menu', { name: /移動/ })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem')).toHaveCount(1)
    await expect(menu.getByRole('menuitem').first()).toHaveAttribute('aria-disabled', 'true')
    await window.keyboard.press('Escape')
    await expect(menu).toBeHidden()

    // B を作り、A に戻る
    await window.getByRole('button', { name: 'Workspace を追加' }).click()
    await window.getByLabel('名前').fill('案件B')
    await window.getByLabel('Production（本番）').check()
    await window.getByRole('button', { name: '作成' }).click()
    const rows = window.locator('.workspace-row')
    await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')
    await rows.nth(0).click()
    await expect(tabs.first()).toHaveText('page /m1')

    // 右クリック → 案件B → 確認が出る。Esc でやめると、何も動かない
    await tabs.first().click({ button: 'right' })
    await expect(menu.getByRole('menuitem', { name: /案件B/ })).toBeVisible()
    // スクリーンショット（CI の成果物 screenshots-*）
    await window.screenshot({ path: `test-results/tab-move-menu-${process.platform}.png` })
    await menu.getByRole('menuitem', { name: /案件B/ }).click()
    const dialog = window.getByRole('alertdialog')
    await expect(dialog).toContainText('案件B')
    await window.screenshot({ path: `test-results/tab-move-confirm-${process.platform}.png` })
    await expect(dialog).toContainText('ログイン')
    await window.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(tabs.first()).toHaveText('page /m1')

    // もう一度。「今後表示しない」を選んで移す。A には空のタブだけが残る
    await tabs.first().click({ button: 'right' })
    await menu.getByRole('menuitem', { name: /案件B/ }).click()
    await dialog.getByLabel('今後表示しない').check()
    await dialog.getByRole('button', { name: '移す' }).click()
    await expect(dialog).toBeHidden()
    await expect(tabs).toHaveCount(1)
    await expect(tabs.first()).toHaveText('新しいタブ')
    await expect(window.getByRole('status').filter({ hasText: '案件B へ移しました' })).toHaveCount(
      1
    )
    // 「今後表示しない」は設定に残る
    const hidden = await window.evaluate(async () => {
      const { settings } = (window as unknown as { trueful: Window['trueful'] }).trueful
      const got = await settings.get()
      return got.ok ? got.value.settings.hideMoveTabNotice : undefined
    })
    expect(hidden).toBe(true)

    // B を開くと、移したタブがある。キーボード（Shift+F10）で開いたメニューから、確認なしで A へ戻す
    await rows.nth(1).click()
    const moved = tabs.filter({ hasText: 'page /m1' })
    await expect(moved).toHaveCount(1)
    await moved.focus()
    await window.keyboard.press('Shift+F10')
    await expect(menu).toBeVisible()
    // CI ではウィンドウが前面にないことがあり toBeFocused は使えないので、activeElement を見る
    await expect
      .poll(() => window.evaluate(() => document.activeElement?.textContent ?? ''))
      .toContain('案件A')
    await window.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(moved).toHaveCount(0)
    await rows.nth(0).click()
    await expect(tabs.filter({ hasText: 'page /m1' })).toHaveCount(1)
  } finally {
    await app.close()
    cleanup()
  }
})
