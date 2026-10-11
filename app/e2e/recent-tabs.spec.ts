import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appWindow, launchApp } from './launchApp'

test('最近使ったタブ列（F15）: 2段目を畳んだときだけ、最後に見た順に設定の枚数まで出し、選ぶ・× で閉じる', async () => {
  const { app, cleanup } = await launchApp((dir) =>
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ recentTabsCount: 2 }))
  )
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    // タブを3つにする（作ると選ばれるので、最後に見た順は 3 → 2 → 1）
    const tabRows = window.locator('.tab-row')
    for (const n of [2, 3]) {
      await window.locator('.tab-new').click()
      await expect(tabRows).toHaveCount(n)
    }
    const strip = window.getByRole('navigation', { name: '最近使ったタブ' })
    await expect(strip).toHaveCount(0)

    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('toggle-side-panel')!.click()
    )
    const items = strip.locator('.recent-tab-select')
    await expect(items).toHaveCount(2)
    await expect(items.first()).toHaveAttribute('aria-current', 'true')
    await window.screenshot({ path: `test-results/recent-tabs-${process.platform}.png` })

    // 2枚目（ひとつ前に見たタブ）を選ぶと、それが先頭になる
    await items.nth(1).click()
    await expect(items.first()).toHaveAttribute('aria-current', 'true')
    // × で閉じると、残りの2枚が出る
    await strip
      .getByRole('button', { name: /を閉じる/ })
      .first()
      .click()
    await expect(items).toHaveCount(2)
    const left = await window.evaluate(async () => {
      const api = (window as unknown as { trueful: Window['trueful'] }).trueful
      const list = await api.workspace.list()
      if (!list.ok || list.value.currentId === null) return -1
      const tabs = await api.tab.list(list.value.currentId)
      return tabs.ok ? tabs.value.tabs.length : -1
    })
    expect(left).toBe(2)

    // 開くと消える
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('toggle-side-panel')!.click()
    )
    await expect(strip).toHaveCount(0)
  } finally {
    await app.close()
    cleanup()
  }
})
