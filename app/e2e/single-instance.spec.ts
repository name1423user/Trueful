import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { appWindow, launchApp } from './launchApp'

test('同じ保存場所での2つ目の起動は、DB に触れずにすぐ終わり、1つ目は動き続ける', async () => {
  const first = await launchApp()
  try {
    const window = await appWindow(first.app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()

    // 2つ目を、同じ保存場所で直接起動する（Playwright の launch は、すぐ終わるプロセスを待てないため）
    const electronPath = (await import('electron')).default as unknown as string
    const code = await new Promise<number | null>((resolve) => {
      // root で動く環境（コンテナ）では、Playwright と同じく --no-sandbox が要る（Electron が起動を拒むため）
      const args = process.getuid?.() === 0 ? ['.', '--no-sandbox'] : ['.']
      const child = spawn(electronPath, args, {
        env: { ...process.env, TRUEFUL_USER_DATA_DIR: first.userDataDir },
        stdio: 'ignore'
      })
      const timer = setTimeout(() => child.kill(), 20_000)
      child.on('exit', (exitCode) => {
        clearTimeout(timer)
        resolve(exitCode)
      })
    })
    expect(code).toBe(0)

    // 1つ目は動き続けている（起動中なので clean_exit は 0 のまま。2つ目が書き換えていない）
    const db = new DatabaseSync(join(first.userDataDir, 'trueful.db'), { readOnly: true })
    try {
      expect(db.prepare('SELECT clean_exit v FROM app_state').get()?.['v']).toBe(0)
    } finally {
      db.close()
    }
    await window.getByRole('button', { name: 'Workspace を追加' }).click()
    await window.getByLabel('名前').fill('案件B')
    await window.getByRole('button', { name: '作成' }).click()
    await expect(window.locator('.workspace-row')).toHaveCount(2)
    await first.app.close()
  } finally {
    first.cleanup()
  }
})
