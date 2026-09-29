import { expect, test } from '@playwright/test'
import { appWindow, launchApp } from './launchApp'

test('6 個目を作ると、いちばん古い Workspace に「休止中」の印が付き、事後の知らせが出る。選ぶと印が消える', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    const rows = window.locator('.workspace-row')
    const notice = window.getByRole('status').filter({ hasText: '休止しました' })

    for (let i = 1; i <= 6; i++) {
      if (i > 1) await window.locator('.workspace-add').click()
      await window.getByLabel('名前').fill(`W${i}`)
      await window.getByRole('button', { name: '作成' }).click()
      await expect(rows).toHaveCount(i)
      // 5 個目までは印も知らせもない
      if (i <= 5) {
        await expect(window.locator('.workspace-state')).toHaveCount(0)
        await expect(notice).toHaveCount(0)
      }
    }

    // 6 個目で W1 が休止する。印は文字（色だけに頼らない）
    await expect(rows.nth(0)).toContainText('休止中')
    await expect(window.locator('.workspace-state')).toHaveCount(1)
    await expect(notice).toContainText('「W1」')
    await window.screenshot({ path: `test-results/dormant-ui-${process.platform}.png` })

    // 知らせは閉じられる
    await window.getByRole('button', { name: '閉じる', exact: true }).click()
    await expect(notice).toHaveCount(0)

    // W1 を選ぶと復帰して印が消え、代わりに W2 が休止する（切り替えの後に一覧を読み直す）
    await rows.nth(0).click()
    await expect(rows.nth(0)).not.toContainText('休止中')
    await expect(rows.nth(1)).toContainText('休止中')
    await expect(notice).toContainText('「W2」')
  } finally {
    await app.close()
    cleanup()
  }
})
