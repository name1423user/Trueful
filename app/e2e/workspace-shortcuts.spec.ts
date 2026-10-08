import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { launchApp } from './launchApp'

let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    // ページが keydown を止める（Trueful が予約したキーは、それでも効く）
    res.end(
      `<!doctype html><title>page ${req.url}</title><body>${req.url}` +
        `<script>addEventListener('keydown', (e) => e.preventDefault(), true)</script></body>`
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

test('Workspace の切り替え（macOS は Ctrl+数字、Windows・Linux は Alt+数字）とタブの選択（Cmd/Ctrl+数字）。ページにフォーカスがあっても効き、キーは重ならない', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    for (const name of ['案件A', '案件B', '案件C']) {
      if (name !== '案件A') await window.getByRole('button', { name: 'Workspace を追加' }).click()
      await window.getByLabel('名前').fill(name)
      await window.getByRole('button', { name: '作成' }).click()
      await expect(window.getByText(`今の Workspace: ${name}`)).toBeVisible()
    }
    const rows = window.locator('.workspace-row')
    const menuItem = (id: string): Promise<void> =>
      app.evaluate(({ Menu }, itemId) => {
        Menu.getApplicationMenu()?.getMenuItemById(itemId)?.click()
      }, id)

    // キーの割り当て（auto: macOS は Ctrl、Windows・Linux は Alt）。タブの Cmd/Ctrl+数字とぶつからない
    const keys = await app.evaluate(({ Menu }) => {
      const get = (id: string): string | undefined =>
        Menu.getApplicationMenu()?.getMenuItemById(id)?.accelerator?.toString()
      return { workspace: get('workspace-switch-2'), tab: get('tab-select-2') }
    })
    expect(keys.workspace).toBe(process.platform === 'darwin' ? 'Ctrl+2' : 'Alt+2')
    expect(keys.tab).toBe('CmdOrCtrl+2')

    // Workspace の切り替え。左パネルの並び順の n 番目。今の Workspace を選んでも何も起きない
    await menuItem('workspace-switch-1')
    await expect(rows.nth(0)).toHaveAttribute('aria-current', 'true')
    await menuItem('workspace-switch-3')
    await expect(rows.nth(2)).toHaveAttribute('aria-current', 'true')
    await menuItem('workspace-switch-3')
    await menuItem('workspace-switch-9') // 9 番目はない（何も起きない）
    await expect(rows.nth(2)).toHaveAttribute('aria-current', 'true')

    // タブの選択: 1〜8 は左から、9 は最後のタブ。タブの数より大きい番号は何もしない
    const address = window.getByLabel('アドレス')
    const tabs = window.locator('.tab-row')
    await address.fill(`${origin}/t1`)
    await address.press('Enter')
    await expect(tabs.first()).toHaveText('page /t1')
    for (const n of [2, 3]) {
      await window.getByRole('button', { name: '新しいタブ' }).last().click()
      await expect(tabs).toHaveCount(n)
      await expect(tabs.last()).toHaveAttribute('aria-current', 'true')
    }
    await menuItem('tab-select-1')
    await expect(tabs.nth(0)).toHaveAttribute('aria-current', 'true')
    await menuItem('tab-select-2')
    await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'true')
    await menuItem('tab-select-9')
    await expect(tabs.nth(2)).toHaveAttribute('aria-current', 'true')
    await menuItem('tab-select-8') // 8 番目はない（何も起きない）
    await expect(tabs.nth(2)).toHaveAttribute('aria-current', 'true')

    // ページ（WebContentsView）にフォーカスがあるときも、キーが効く（ページが奪わない）。
    // 1つ目のタブを開いてページを前に出し、そのページへキーを送る
    await menuItem('tab-select-1')
    await expect(tabs.nth(0)).toHaveAttribute('aria-current', 'true')
    const modifiers = process.platform === 'darwin' ? (['control'] as const) : (['alt'] as const)
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => {
          const view = BrowserWindow.getAllWindows()[0]!.contentView.children.at(-1)
          return view?.getBounds().width ?? 0
        })
      )
      .toBeGreaterThan(0)
    await app.evaluate(({ BrowserWindow }, mods) => {
      const view = BrowserWindow.getAllWindows()[0]!.contentView.children.at(-1) as unknown as {
        webContents: Electron.WebContents
      }
      view.webContents.focus()
      view.webContents.sendInputEvent({ type: 'keyDown', keyCode: '1', modifiers: [...mods] })
    }, modifiers)
    await expect(rows.nth(0)).toHaveAttribute('aria-current', 'true')
  } finally {
    await app.close()
    cleanup()
  }
})
