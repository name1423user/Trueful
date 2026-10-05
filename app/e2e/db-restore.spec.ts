import { expect, test } from '@playwright/test'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appWindow, launchApp } from './launchApp'

test('DB が壊れていたら、バックアップから戻して知らせる。壊れたファイルは残す', async () => {
  const first = await launchApp()
  try {
    // 1回目: 案件A を作る。2回目: 起動するとバックアップが取られる（案件A を含む）
    {
      const window = await appWindow(first.app)
      await window.getByLabel('名前').fill('案件A')
      await window.getByRole('button', { name: '作成' }).click()
      await expect(window.locator('.workspace-row')).toHaveCount(1)
      await first.app.close()
    }
    {
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      await expect((await appWindow(app)).getByText('今の Workspace: 案件A')).toBeVisible()
      await app.close()
    }

    // DB を壊す（DB ではないファイルにする）
    writeFileSync(join(first.userDataDir, 'trueful.db'), 'not a database '.repeat(100))

    // 3回目: バックアップから戻り、案件A がある。知らせが出て、閉じられる
    {
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      const window = await appWindow(app)
      await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()
      const notice = window.getByRole('status').filter({ hasText: 'バックアップから戻しました' })
      await expect(notice).toContainText('trueful.db.broken-')
      await window.screenshot({ path: `test-results/db-restore-${process.platform}.png` })
      await window.getByRole('button', { name: '閉じる', exact: true }).click()
      await expect(notice).toHaveCount(0)
      await app.close()
    }
    expect(readdirSync(first.userDataDir).some((n) => n.startsWith('trueful.db.broken-'))).toBe(
      true
    )
    expect(existsSync(join(first.userDataDir, 'trueful.db'))).toBe(true)
  } finally {
    first.cleanup()
  }
})
