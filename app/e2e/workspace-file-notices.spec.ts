import { expect, test } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appWindow, launchApp } from './launchApp'

// ADR-012 の3パターン（F12）を、ファイルを壊して起動し直して再現する
test('① 壊れたマニフェストは直して軽く知らせ、② 作りかけは作成へ誘導し、③ 消えたファイルは強く知らせる', async () => {
  const first = await launchApp()
  const workspaces = join(first.userDataDir, 'workspaces')
  try {
    const window = await appWindow(first.app)
    for (const name of ['案件A', '案件B']) {
      await window.evaluate(async (n) => {
        const api = (window as unknown as { trueful: Window['trueful'] }).trueful.workspace
        return api.create({ name: n, mode: 'custom', requestId: crypto.randomUUID() })
      }, name)
    }
    await first.app.close()

    // ① 案件A のマニフェストを壊す。② DB にない番号のフォルダ（作成の途中で終わった）を置く。
    // ③ 案件B のフォルダとパーティションを消す
    writeFileSync(join(workspaces, '1', 'com.json'), '{"id":')
    mkdirSync(join(workspaces, '9'), { recursive: true })
    rmSync(join(workspaces, '2'), { recursive: true, force: true })
    rmSync(join(first.userDataDir, 'Partitions', 'workspace-2'), { recursive: true, force: true })

    const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
    const ui = await appWindow(app)
    await expect(ui.getByRole('status').filter({ hasText: '案件A」の設定ファイル' })).toBeVisible()
    await expect(ui.getByRole('status').filter({ hasText: '作成が終わる前' })).toBeVisible()
    const missing = ui.getByRole('alert').filter({ hasText: '案件B」のファイルが見つかりません' })
    await expect(missing).toBeVisible()
    await ui.screenshot({ path: `test-results/workspace-file-notices-${process.platform}.png` })

    // ③ 「削除する」で削除の確認が出る（やめても知らせは戻らない）
    await missing.getByRole('button', { name: '削除する' }).click()
    await expect(ui.getByRole('button', { name: '削除する', exact: true })).toHaveCount(1)
    await expect(missing).toHaveCount(0)
    await ui.getByRole('button', { name: 'やめる' }).click()

    // ② 「Workspace を作る」で作成画面が出る
    await ui.getByRole('button', { name: 'Workspace を作る' }).click()
    await expect(ui.getByLabel('名前')).toBeVisible()
    await app.close()
  } finally {
    first.cleanup()
  }
})
