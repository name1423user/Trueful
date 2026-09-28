import { expect, test } from '@playwright/test'
import { launchApp } from './launchApp'

test('Workspace が0個なら作成画面を出し、作ると一覧に出る。二度押しでも1つ、切り替えは画面込みで 300ms 以内', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: 'Workspace を作る' })).toBeVisible()

    // 1つ目: 作成ボタンを二度押しする
    await window.getByLabel('名前').fill('案件A')
    await window.getByLabel('Production（本番）').check()
    await window.getByRole('button', { name: '作成' }).dblclick()
    const rows = window.locator('.workspace-row')
    await expect(rows).toHaveCount(1)
    await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()

    // 2つ目: 左パネルの「追加」から作る
    await window.getByRole('button', { name: '+ Workspace を追加' }).click()
    await window.getByLabel('名前').fill('案件B')
    await window.getByRole('button', { name: '作成' }).click()
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')

    // 案件A に切り替える。クリックから、今の Workspace の表示が変わるまでの時間を測る
    const switchMs = await window.evaluate(async () => {
      const row = document.querySelectorAll<HTMLButtonElement>('.workspace-row')[0]
      const started = performance.now()
      row.click()
      await new Promise<void>((resolve) => {
        const check = (): void =>
          row.getAttribute('aria-current') === 'true'
            ? resolve()
            : void requestAnimationFrame(check)
        check()
      })
      return performance.now() - started
    })
    expect(switchMs).toBeLessThan(300)
    await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()

    await window.screenshot({ path: `test-results/workspace-${process.platform}.png` })
  } finally {
    await app.close()
    cleanup()
  }
})
