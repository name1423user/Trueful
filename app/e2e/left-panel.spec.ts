import { expect, test } from '@playwright/test'
import { launchApp } from './launchApp'

test('左パネル: 1段目に今の Workspace の頭文字と Mode 色、2段目は今の Workspace だけタブを展開。キーボードだけで切り替えられる', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    await window.getByLabel('名前').fill('案件A')
    await window.getByLabel('Production（本番）').check()
    await window.getByRole('button', { name: '作成' }).click()
    await window.getByRole('button', { name: 'Workspace を追加' }).click()
    await window.getByLabel('名前').fill('beta')
    await window.getByRole('button', { name: '作成' }).click()

    // 1段目（幅 48px）: 今の Workspace（beta、Custom）の頭文字と Mode 色
    const rail = window.getByRole('navigation', { name: 'パネルの切り替え' })
    expect((await rail.boundingBox())?.width).toBe(48)
    const badge = rail.getByRole('img', { name: '今の Workspace: beta' })
    await expect(badge).toHaveText('B')
    await expect(badge).toHaveClass(/mode-custom/)
    await expect(rail.getByRole('button', { name: 'タブ' })).toHaveAttribute('aria-pressed', 'true')

    // 2段目: 今の Workspace（beta）の行の下にだけタブ列がある。ほかの Workspace は名前の行だけ
    const rows = window.locator('.workspace-item')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator('.tab-row')).toHaveCount(0)
    await expect(rows.nth(1).locator('.tab-row')).toHaveCount(1)
    await expect(rows.nth(0).locator('.workspace-row')).not.toHaveAttribute('aria-expanded', 'true')
    await expect(rows.nth(1).locator('.workspace-row')).toHaveAttribute('aria-expanded', 'true')

    // キーボードだけで: 案件A の行へ Tab で移り、Enter で切り替える
    await rows.nth(1).locator('.workspace-row').focus()
    await window.keyboard.press('Shift+Tab')
    await expect
      .poll(() => window.evaluate(() => document.activeElement?.textContent ?? ''))
      .toContain('案件A')
    await window.keyboard.press('Enter')
    await expect(rows.nth(0).locator('.tab-row')).toHaveCount(1)
    await expect(rows.nth(1).locator('.tab-row')).toHaveCount(0)
    await expect(rail.getByRole('img', { name: '今の Workspace: 案件A' })).toHaveText('案')
    await expect(rail.getByRole('img', { name: '今の Workspace: 案件A' })).toHaveClass(
      /mode-production/
    )

    // タブを足しても、入れ子のまま今の Workspace の下に並ぶ
    await rows.nth(0).locator('.tab-new').click()
    await expect(rows.nth(0).locator('.tab-row')).toHaveCount(2)

    await window.screenshot({ path: `test-results/left-panel-${process.platform}.png` })
  } finally {
    await app.close()
    cleanup()
  }
})
