import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { appWindow, crashApp as crash, launchApp } from './launchApp'

test('異常終了の後の起動: 「復元しますか」と聞く。復元しないなら Developer Home、復元するなら前回の Workspace とタブ', async () => {
  const first = await launchApp()
  try {
    // 1回目: 案件A・案件B を作り（今は案件B）、強制終了する
    {
      const window = await appWindow(first.app)
      for (const [i, name] of ['案件A', '案件B'].entries()) {
        if (i > 0) await window.getByRole('button', { name: 'Workspace を追加' }).click()
        await window.getByLabel('名前').fill(name)
        await window.getByRole('button', { name: '作成' }).click()
        await expect(window.locator('.workspace-row')).toHaveCount(i + 1)
      }
      await crash(first.app)
    }

    // 2回目: 確認が出る。ページは読み込まず、タブ列も出さない。「復元しない」→ Developer Home
    {
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      const window = await appWindow(app)
      const prompt = window.getByRole('region', { name: '前回は正しく終了しませんでした' })
      await expect(prompt).toContainText('前回の Workspace とタブを復元しますか？')
      await expect(window.getByTestId('page-area')).toHaveCount(0)
      await expect(window.locator('.tab-row')).toHaveCount(0)
      await window.screenshot({ path: `test-results/crash-restore-${process.platform}.png` })
      await prompt.getByRole('button', { name: '復元しない' }).click()
      const home = window.getByRole('region', { name: 'Developer Home' })
      await expect(home).toContainText('前回の Workspace とタブは復元していません')
      await home.getByRole('button', { name: /案件A/ }).click()
      await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()
      await expect(window.getByTestId('page-area')).toHaveCount(1)
      await crash(app)
    }

    // 3回目: また異常終了の後。「復元する」→ 前回の Workspace（案件A）とタブ
    {
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      const window = await appWindow(app)
      const prompt = window.getByRole('region', { name: '前回は正しく終了しませんでした' })
      await prompt.getByRole('button', { name: '復元する' }).click()
      await expect(prompt).toHaveCount(0)
      await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()
      await expect(window.getByTestId('page-area')).toHaveCount(1)
      await expect(window.locator('.tab-row')).toHaveCount(1)
      await app.close()
    }

    // 4回目: 正常に終了した後でも、前回の正常な終了から 61 分たっていれば Developer Home。ここで強制終了する
    {
      const db = new DatabaseSync(join(first.userDataDir, 'trueful.db'))
      db.prepare('UPDATE app_state SET last_quit_time_ms = ?').run(Date.now() - 61 * 60_000)
      db.close()
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      const window = await appWindow(app)
      await expect(window.getByRole('region', { name: 'Developer Home' })).toBeVisible()
      await crash(app)
    }

    // 5回目: 古い正常な終了の記録が残っていても、前回は異常終了なので、Developer Home ではなく確認を出す
    {
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      const window = await appWindow(app)
      const prompt = window.getByRole('region', { name: '前回は正しく終了しませんでした' })
      await expect(prompt).toBeVisible()
      await expect(window.getByRole('region', { name: 'Developer Home' })).toHaveCount(0)
      await prompt.getByRole('button', { name: '復元する' }).click()
      await expect(window.getByTestId('page-area')).toHaveCount(1)
      await app.close()
    }

    // 6回目: 正常に終了した後なので、聞かずに復元する
    {
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      const window = await appWindow(app)
      await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()
      await expect(
        window.getByRole('region', { name: '前回は正しく終了しませんでした' })
      ).toHaveCount(0)
      await app.close()
    }
  } finally {
    first.cleanup()
  }
})
