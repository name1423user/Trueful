import { expect, test } from '@playwright/test'
import { launchApp } from './launchApp'

test('Workspace の削除: 確認でログインとサイトのデータも消えると示し、やめられる。消すと残りへ移り、最後の1つなら作成画面', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    const rows = window.locator('.workspace-row')
    // CI ではウィンドウが前面にないことがあり toBeFocused は "inactive" になるので、activeElement を見る
    const focused = (): Promise<string> =>
      window.evaluate(() => document.activeElement?.textContent ?? '')

    // 案件A・案件B・案件C を作る（今は案件C）
    for (const [i, name] of ['案件A', '案件B', '案件C'].entries()) {
      if (i > 0) await window.getByRole('button', { name: 'Workspace を追加' }).click()
      await window.getByLabel('名前').fill(name)
      await window.getByRole('button', { name: '作成' }).click()
      await expect(rows).toHaveCount(i + 1)
    }

    // 削除のボタン → 確認。ページ（WebContentsView）は隠し、中央に確認を出す
    await window.getByRole('button', { name: '案件C を削除' }).click()
    const dialog = window.getByRole('alertdialog', { name: '「案件C」を削除しますか？' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('ログイン（Cookie）とサイトのデータも消えます')
    await expect(window.getByTestId('page-area')).toHaveCount(0)
    // 間違えて消さないよう、最初のフォーカスは「やめる」
    await expect.poll(focused).toBe('やめる')
    // 確認の間は、左パネルと上端を操作できない（ほかの削除・切り替えと競合させない）
    await expect(window.locator('.left-panel')).toHaveAttribute('inert')
    await expect(window.locator('.top-bar')).toHaveAttribute('inert')
    await window.screenshot({ path: `test-results/workspace-delete-${process.platform}.png` })

    // やめる → 何も消えず、フォーカスは今の行へ戻る。Esc でもやめられる
    await dialog.getByRole('button', { name: 'やめる' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(rows).toHaveCount(3)
    await expect(window.locator('.left-panel')).not.toHaveAttribute('inert')
    await expect.poll(focused).toContain('案件C')
    await window.getByRole('button', { name: '案件C を削除' }).click()
    await window.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(rows).toHaveCount(3)

    // 今ではない案件A を消す → 今の Workspace は案件C のまま。フォーカスは今の行へ
    await window.getByRole('button', { name: '案件A を削除' }).click()
    await window
      .getByRole('alertdialog', { name: '「案件A」を削除しますか？' })
      .getByRole('button', { name: '削除する' })
      .click()
    await expect(rows).toHaveCount(2)
    await expect(window.getByText('今の Workspace: 案件C')).toBeVisible()
    await expect.poll(focused).toContain('案件C')

    // 今の案件C を消す（二度押ししても1回）。残りの案件B へ移る
    await window.getByRole('button', { name: '案件C を削除' }).click()
    await dialog.getByRole('button', { name: '削除する' }).dblclick()
    await expect(rows).toHaveCount(1)
    await expect(window.getByText('今の Workspace: 案件B')).toBeVisible()
    await expect(window.getByTestId('page-area')).toHaveCount(1)

    // 最後の1つを消すと、作成画面になる
    await window.getByRole('button', { name: '案件B を削除' }).click()
    await window
      .getByRole('alertdialog', { name: '「案件B」を削除しますか？' })
      .getByRole('button', { name: '削除する' })
      .click()
    await expect(window.getByRole('heading', { name: 'Workspace を作る' })).toBeVisible()
    await expect(rows).toHaveCount(0)
  } finally {
    await app.close()
    cleanup()
  }
})
