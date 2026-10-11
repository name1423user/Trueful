import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appWindow, launchApp } from './launchApp'

test('設定の画面: Cmd/Ctrl+, で開き、変えるとすぐ settings.json に書き、手の編集も映し、Esc で閉じる', async () => {
  const { app, userDataDir, cleanup } = await launchApp()
  const file = join(userDataDir, 'settings.json')
  const saved = (): Record<string, unknown> => JSON.parse(readFileSync(file, 'utf8'))
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()

    // メニューの項目（Cmd/Ctrl+,）で開く。ページは隠れ、見出しにフォーカス
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('open-settings')!.click()
    )
    const heading = window.getByRole('heading', { name: '設定' })
    await expect(heading).toBeFocused()

    // テーマ: ダークにすると、settings.json と OS 側のテーマ（ページの prefers-color-scheme）に効く
    await window.getByLabel('ダーク').check()
    await expect.poll(() => saved().theme).toBe('dark')
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)).toBe(true)
    // UI はダークの色になる
    await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(
      await window.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg')
      )
    ).toBe('#18181b')
    await window.screenshot({ path: `test-results/settings-${process.platform}.png` })

    // 整数の欄: 範囲内なら Enter で書く。範囲外は知らせて書かない
    const days = window.getByLabel('履歴の保存期間（日）')
    await days.fill('30')
    await days.press('Enter')
    await expect.poll(() => saved().historyRetentionDays).toBe(30)
    await days.fill('0')
    await days.press('Enter')
    await expect(window.getByRole('alert')).toContainText('1〜3650')
    expect(saved().historyRetentionDays).toBe(30)

    // 手で編集したら、画面も変わる
    writeFileSync(file, JSON.stringify({ ...saved(), showDeveloperHome: false }))
    await expect(
      window.getByLabel('しばらく使っていなかったら Developer Home を出す')
    ).not.toBeChecked()
    await expect(window.getByLabel('Developer Home を出すまでの時間（分）')).toBeDisabled()

    // ライトにすると戻る
    await window.getByLabel('ライト').check()
    await expect(window.locator('html')).toHaveAttribute('data-theme', 'light')

    // Esc で閉じると、ページの画面に戻り、フォーカスは今の Workspace の行へ
    await heading.press('Escape')
    await expect(heading).toHaveCount(0)
    await expect(window.locator('.workspace-row[aria-current="true"]')).toBeFocused()
  } finally {
    await app.close()
    cleanup()
  }
})
