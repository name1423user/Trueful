import { expect, test } from '@playwright/test'
import { launchApp } from './launchApp'

test('起動してウィンドウが出る（三ペインの枠、セキュリティの設定）', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()

    await expect(window.locator('header.top-bar')).toBeVisible()
    await expect(window.locator('nav.left-panel')).toBeVisible()
    await expect(window.locator('main.content')).toBeVisible()

    const prefs = await app.evaluate(({ BrowserWindow }) => {
      // getLastWebPreferences は実行時にはあるが、electron.d.ts に型がない
      const wc = BrowserWindow.getAllWindows()[0].webContents as unknown as {
        getLastWebPreferences(): Electron.WebPreferences | null
      }
      const p = wc.getLastWebPreferences()
      return {
        contextIsolation: p?.contextIsolation,
        sandbox: p?.sandbox,
        nodeIntegration: p?.nodeIntegration
      }
    })
    expect(prefs).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false })

    await window.screenshot({ path: `test-results/launch-${process.platform}.png` })
  } finally {
    await app.close()
    cleanup()
  }
})
