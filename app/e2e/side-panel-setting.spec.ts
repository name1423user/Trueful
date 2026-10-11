import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appWindow, launchApp } from './launchApp'

test('2段目の開閉は設定 secondaryPanelOpen に残り、起動時と手の編集に合わせる（幅による自動の開閉は残さない）', async () => {
  const { app, userDataDir, cleanup } = await launchApp((dir) =>
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ secondaryPanelOpen: false }))
  )
  const file = join(userDataDir, 'settings.json')
  const saved = (): Record<string, unknown> => JSON.parse(readFileSync(file, 'utf8'))
  try {
    const window = await appWindow(app)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1200, 800))
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const side = window.locator('nav.left-panel')
    // 起動時から畳んでいる
    await expect(side).toBeHidden()

    // Cmd/Ctrl+B（メニュー）で開くと、設定に残る
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('toggle-side-panel')!.click()
    )
    await expect(side).toBeVisible()
    await expect.poll(() => saved().secondaryPanelOpen).toBe(true)

    // 幅で自動に畳んでも、設定は変えない。広げると開く
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(800, 800))
    await expect(side).toBeHidden()
    expect(saved().secondaryPanelOpen).toBe(true)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1200, 800))
    await expect(side).toBeVisible()

    // 手で編集したら合わせる
    writeFileSync(file, JSON.stringify({ ...saved(), secondaryPanelOpen: false }))
    await expect(side).toBeHidden()
  } finally {
    await app.close()
    cleanup()
  }
})
