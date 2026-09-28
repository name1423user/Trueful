import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { appWindow, launchApp } from './launchApp'

// ページ（WebContentsView）が中央の空の div と同じ位置・大きさに置かれているか
async function viewMatchesArea(app: ElectronApplication, window: Page): Promise<boolean> {
  const area = await window.getByTestId('page-area').boundingBox()
  const view = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.contentView.children.at(-1)?.getBounds()
  )
  return (
    !!area &&
    !!view &&
    view.x === Math.round(area.x) &&
    view.y === Math.round(area.y) &&
    view.width === Math.round(area.width) &&
    view.height === Math.round(area.height)
  )
}

const toggleFromMenu = (app: ElectronApplication): Promise<void> =>
  app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.getMenuItemById('toggle-side-panel')?.click()
  )

test('2段目を Cmd/Ctrl+B（メニュー）と1段目のボタンで畳む・開く。960px 未満では自動で畳む。ページの場所も追いかける', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1200, 800))
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()

    const side = window.locator('nav.left-panel')
    const rail = window.getByRole('navigation', { name: 'パネルの切り替え' })
    const tabsButton = rail.getByRole('button', { name: 'タブ' })
    await expect(side).toBeVisible()
    await expect.poll(() => viewMatchesArea(app, window)).toBe(true)

    // メニュー（Cmd/Ctrl+B）で畳む。畳んでも1段目で今の Workspace が分かる
    await toggleFromMenu(app)
    await expect(side).toBeHidden()
    await expect(rail.getByRole('img', { name: '今の Workspace: 案件A' })).toBeVisible()
    await expect(tabsButton).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => viewMatchesArea(app, window)).toBe(true)
    await toggleFromMenu(app)
    await expect(side).toBeVisible()
    await expect.poll(() => viewMatchesArea(app, window)).toBe(true)

    // 1段目の「タブ」を押し直すと畳み、もう一度押すと開く
    await tabsButton.click()
    await expect(side).toBeHidden()
    await tabsButton.click()
    await expect(side).toBeVisible()
    await expect(tabsButton).toHaveAttribute('aria-pressed', 'true')

    // ウィンドウの幅が 960px 未満になると自動で畳み、広げると開く
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 800))
    await expect(side).toBeHidden()
    await expect.poll(() => viewMatchesArea(app, window)).toBe(true)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1200, 800))
    await expect(side).toBeVisible()
    await expect.poll(() => viewMatchesArea(app, window)).toBe(true)

    // スクリーンショット: ライト・ダーク × 2段目の開閉
    for (const theme of ['light', 'dark'] as const) {
      await app.evaluate(({ nativeTheme }, t) => {
        nativeTheme.themeSource = t
      }, theme)
      await expect
        .poll(() => window.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
        .toBe(theme === 'dark')
      await window.screenshot({
        path: `test-results/side-panel-${theme}-open-${process.platform}.png`
      })
      await toggleFromMenu(app)
      await expect(side).toBeHidden()
      await window.screenshot({
        path: `test-results/side-panel-${theme}-closed-${process.platform}.png`
      })
      await toggleFromMenu(app)
      await expect(side).toBeVisible()
    }
  } finally {
    await app.close()
    cleanup()
  }
})
