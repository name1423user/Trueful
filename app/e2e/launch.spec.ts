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

    // preload は window.trueful だけを公開し、ipcRenderer や Node の機能は UI から見えない
    const exposed = await window.evaluate(() => ({
      trueful: typeof (window as unknown as { trueful?: unknown }).trueful,
      ipcRenderer: 'ipcRenderer' in window,
      electron: 'electron' in window,
      require: typeof (globalThis as { require?: unknown }).require,
      process: typeof (globalThis as { process?: unknown }).process
    }))
    expect(exposed).toEqual({
      trueful: 'object',
      ipcRenderer: false,
      electron: false,
      require: 'undefined',
      process: 'undefined'
    })

    // ウィンドウは ready-to-show の後に表示する。表示される前は撮れないので待つ
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())
      )
      .toBe(true)
    await window.screenshot({ path: `test-results/launch-${process.platform}.png` })
  } finally {
    await app.close()
    cleanup()
  }
})
