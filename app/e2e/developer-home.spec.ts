import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { appWindow, launchApp } from './launchApp'

// 前回の正常な終了の時刻を、何分か前にずらす（「1時間を超えた」起動を作る）。null なら記録がないかを返す
function shiftLastQuit(userDataDir: string, minutesAgo: number): number | null {
  const db = new DatabaseSync(join(userDataDir, 'trueful.db'))
  try {
    const before = db.prepare('SELECT last_quit_time_ms v FROM app_state').get()?.['v']
    db.prepare('UPDATE app_state SET last_quit_time_ms = ?').run(Date.now() - minutesAgo * 60_000)
    return before === null || before === undefined ? null : Number(before)
  } finally {
    db.close()
  }
}

test('起動: 前回の終了から1時間を超えたら Developer Home、以内なら復元、「表示しない」設定ならいつも復元', async () => {
  const first = await launchApp()
  try {
    // 1回目: 案件A・案件B を作る（今は案件B）。正常に終了すると、終了の時刻が記録される
    {
      const window = await appWindow(first.app)
      for (const [i, name] of ['案件A', '案件B'].entries()) {
        if (i > 0) await window.getByRole('button', { name: 'Workspace を追加' }).click()
        await window.getByLabel('名前').fill(name)
        await window.getByRole('button', { name: '作成' }).click()
        await expect(window.locator('.workspace-row')).toHaveCount(i + 1)
      }
      await first.app.close()
    }
    expect(shiftLastQuit(first.userDataDir, 61)).not.toBeNull()

    // 2回目: 61 分たっている → Developer Home。ページは出さない。カードを選ぶとその Workspace を開く
    {
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      const window = await appWindow(app)
      const home = window.getByRole('region', { name: 'Developer Home' })
      await expect(home).toBeVisible()
      await expect(home.getByRole('button', { name: /案件A/ })).toBeVisible()
      await expect(home.getByRole('button', { name: /案件B/ })).toBeVisible()
      await expect(window.getByTestId('page-area')).toHaveCount(0)
      // Home の間はタブ列を出さない。フォーカスは見出しにある
      await expect(window.locator('.tab-row')).toHaveCount(0)
      await expect
        .poll(() => window.evaluate(() => document.activeElement?.textContent ?? ''))
        .toBe('Developer Home')
      await window.screenshot({ path: `test-results/developer-home-${process.platform}.png` })
      await home.getByRole('button', { name: /案件A/ }).click()
      await expect(home).toHaveCount(0)
      await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()
      await expect(window.getByTestId('page-area')).toHaveCount(1)
      // 表示しない設定にして終わる
      await window.evaluate(() =>
        (window as unknown as { trueful: Window['trueful'] }).trueful.settings.update({
          showDeveloperHome: false
        })
      )
      await app.close()
    }

    // 3回目: 61 分たっていても、「表示しない」設定なので復元する（今は案件A）
    shiftLastQuit(first.userDataDir, 61)
    {
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      const window = await appWindow(app)
      await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()
      await expect(window.getByRole('region', { name: 'Developer Home' })).toHaveCount(0)
      await window.evaluate(() =>
        (window as unknown as { trueful: Window['trueful'] }).trueful.settings.update({
          showDeveloperHome: true
        })
      )
      await app.close()
    }

    // 4回目: 終了したばかり（1時間以内）なので復元する
    {
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      const window = await appWindow(app)
      await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()
      await expect(window.getByRole('region', { name: 'Developer Home' })).toHaveCount(0)
      await expect(window.getByTestId('page-area')).toHaveCount(1)
      await app.close()
    }

    // 5回目: 61 分たっているので Developer Home が出る。ここで強制終了する（終了の時刻は記録されない）
    shiftLastQuit(first.userDataDir, 61)
    {
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      const window = await appWindow(app)
      await expect(window.getByRole('region', { name: 'Developer Home' })).toBeVisible()
      app.process().kill('SIGKILL')
      await app.waitForEvent('close').catch(() => undefined)
    }

    // 6回目: 前回は異常終了で、終了の記録がない（起動したときに消してある）。古い記録で Developer Home にはならない
    {
      const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
      const window = await appWindow(app)
      await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()
      await expect(window.getByRole('region', { name: 'Developer Home' })).toHaveCount(0)
      await app.close()
    }
  } finally {
    first.cleanup()
  }
})
