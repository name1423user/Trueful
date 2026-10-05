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

const firstTab = (page: Page): Promise<{ title: string; url: string }> =>
  page.evaluate(async () => {
    const api = (globalThis as unknown as { trueful: Window['trueful'] }).trueful
    const ws = await api.workspace.list()
    if (!ws.ok || ws.value.currentId === null) return { title: '', url: '' }
    const tabs = await api.tab.list(ws.value.currentId)
    const tab = tabs.ok ? tabs.value.tabs[0] : undefined
    return { title: tab?.title ?? '', url: tab?.url ?? '' }
  })

test('ブックマークの画面: メニュー（Cmd/Ctrl+D）とボタンで今のページを足し、編集・削除・選んで開く', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    await address.fill(`${origin}/one`)
    await address.press('Enter')
    await expect(window.locator('.tab-row').first()).toHaveText('page /one', { timeout: 15_000 })

    // 2段目をブックマークにする。最初は空。空のタブ（about:blank）は追加できない
    await window.getByRole('button', { name: 'ブックマーク', exact: true }).click()
    await expect(window.getByText('ブックマークはまだありません')).toBeVisible()

    // メニューの「このページをブックマークに追加」（Cmd/Ctrl+D と同じ項目）で足す
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.getMenuItemById('bookmark-page')?.click()
    )
    const rows = window.locator('.bookmark-row')
    await expect(rows).toHaveText(['page /one'])
    await expect(window.getByRole('status').filter({ hasText: '追加しました' })).toBeVisible()
    await window.screenshot({ path: `test-results/bookmark-ui-${process.platform}.png` })

    // 編集（タイトル）
    await window.getByRole('button', { name: 'page /one を編集' }).click()
    await window.getByLabel('タイトル').fill('最初のページ')
    await window.getByRole('button', { name: '保存' }).click()
    await expect(rows).toHaveText(['最初のページ'])

    // 別のページへ移ってから、ブックマークを選ぶと今のタブで開く
    await address.fill(`${origin}/two`)
    await address.press('Enter')
    await expect
      .poll(async () => (await firstTab(window)).title, { timeout: 15_000 })
      .toBe('page /two')
    await rows.first().click()
    await expect
      .poll(async () => (await firstTab(window)).url, { timeout: 15_000 })
      .toBe(`${origin}/one`)

    // 削除
    await window.getByRole('button', { name: '最初のページ を削除' }).click()
    await expect(window.getByText('ブックマークはまだありません')).toBeVisible()
  } finally {
    await app.close()
    cleanup()
  }
})
