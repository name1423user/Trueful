import { _electron as electron, expect, test } from '@playwright/test'

test('起動してウィンドウが出る（三ペインの枠、セキュリティの設定）', async () => {
  const app = await electron.launch({ args: ['.'] })
  const window = await app.firstWindow()

  await expect(window.locator('header.top-bar')).toBeVisible()
  await expect(window.locator('nav.left-panel')).toBeVisible()
  await expect(window.locator('main.content')).toBeVisible()

  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
    return { contextIsolation: p?.contextIsolation, sandbox: p?.sandbox, nodeIntegration: p?.nodeIntegration }
  })
  expect(prefs).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false })

  await window.screenshot({ path: `test-results/launch-${process.platform}.png` })
  await app.close()
})
