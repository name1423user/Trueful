import { expect, test } from '@playwright/test'
import { appWindow, launchApp } from './launchApp'

// T4-5b: 地の色に今の Workspace の Mode 色を薄く混ぜ、どこにいるかを色でも示す
test('地の色が、今の Workspace の Mode に合わせて変わる', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    const shell = window.locator('.app-shell')
    const colors = (): Promise<{ bg: string; expected: string }> =>
      shell.evaluate((el) => {
        const mode = el.getAttribute('data-mode')
        // 変数の値（#rrggbb）を、計算後の色（rgb()）にそろえて比べる
        const probe = document.createElement('div')
        probe.style.color = getComputedStyle(el).getPropertyValue(`--bg-${mode}`)
        document.body.append(probe)
        const expected = getComputedStyle(probe).color
        probe.remove()
        return { bg: getComputedStyle(el).backgroundColor, expected }
      })

    // Workspace がまだない（作成画面）ときは Mode がないので、素の地のまま
    await expect(shell).not.toHaveAttribute('data-mode')
    await window.getByLabel('名前').fill('案件B')
    await window.getByLabel('Production（本番）').check()
    await window.getByRole('button', { name: '作成' }).click()
    await expect(shell).toHaveAttribute('data-mode', 'production')
    const production = await colors()
    expect(production.bg).toBe(production.expected)

    await window.getByRole('button', { name: 'Workspace を追加' }).click()
    await window.getByLabel('名前').fill('Trueful開発')
    await window.getByLabel('Development（開発）').check()
    await window.getByRole('button', { name: '作成' }).click()
    await expect(shell).toHaveAttribute('data-mode', 'development')
    const development = await colors()
    expect(development.bg).toBe(development.expected)
    expect(development.bg).not.toBe(production.bg)
  } finally {
    await app.close()
    cleanup()
  }
})
