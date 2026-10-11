import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appWindow, launchApp } from './launchApp'

test('テーマ（F14）: settings.json の theme で UI とページの配色が変わり、OS に合わせるなら OS を追いかける', async () => {
  const { app, userDataDir, cleanup } = await launchApp((dir) =>
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'dark' }))
  )
  const file = join(userDataDir, 'settings.json')
  try {
    const window = await appWindow(app)
    const html = window.locator('html')
    const bg = (): Promise<string> =>
      window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg'))
    // 起動したときから、設定のダーク
    await expect(html).toHaveAttribute('data-theme', 'dark')
    expect(await bg()).toBe('#18181b')
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')

    // 手で編集してライトに
    writeFileSync(
      file,
      JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), theme: 'light' })
    )
    await expect(html).toHaveAttribute('data-theme', 'light')
    expect(await bg()).toBe('#f4f4f5')
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')

    // OS に合わせる: OS がダークならダーク、ライトならライト
    await window.evaluate(() =>
      (window as unknown as { trueful: Window['trueful'] }).trueful.settings.update({
        theme: 'system'
      })
    )
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await window.emulateMedia({ colorScheme: 'light' })
    await expect(html).toHaveAttribute('data-theme', 'light')
  } finally {
    await app.close()
    cleanup()
  }
})
