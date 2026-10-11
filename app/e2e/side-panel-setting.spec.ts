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

    // 1段目のボタンで開いても残る。別の一覧に切り替えても、設定は開いたまま
    const rail = window.getByRole('navigation', { name: 'パネルの切り替え' })
    await rail.getByRole('button', { name: 'タブ' }).click()
    await expect(side).toBeVisible()
    await expect.poll(() => saved().secondaryPanelOpen).toBe(true)
    await rail.getByRole('button', { name: 'ブックマーク' }).click()
    await expect(window.getByRole('heading', { name: 'ブックマーク' }).or(side)).toBeVisible()
    expect(saved().secondaryPanelOpen).toBe(true)

    // Cmd/Ctrl+B を続けて2回押すと、元に戻る（押下が消えない）
    await app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()!.getMenuItemById('toggle-side-panel')!
      item.click()
      item.click()
    })
    await expect.poll(() => saved().secondaryPanelOpen).toBe(true)
    await expect(window.locator('nav.left-panel, .left-panel').first()).toBeVisible()

    // 設定の画面のチェックでも変わる
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('open-settings')!.click()
    )
    // 保存の返事で表示が変わるので、uncheck（すぐの確認）ではなく押してから待つ
    await window.getByLabel(/2段目.*を開いておく/).click()
    await expect.poll(() => saved().secondaryPanelOpen).toBe(false)
  } finally {
    await app.close()
    cleanup()
  }
})
