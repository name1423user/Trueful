import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { appWindow, launchApp } from './launchApp'

test('設定の画面: Cmd/Ctrl+, で開き、変えるとすぐ settings.json に書き、手の編集も映し、Esc で閉じる', async () => {
  const { app, userDataDir, cleanup } = await launchApp()
  const file = join(userDataDir, 'settings.json')
  const saved = (): Record<string, unknown> => JSON.parse(readFileSync(file, 'utf8'))
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    await expect(window.getByText('今の Workspace: 案件A')).toBeVisible()

    // メニューの項目（Cmd/Ctrl+,）で開く。ページは隠れ、見出しにフォーカス
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('open-settings')!.click()
    )
    const heading = window.getByRole('heading', { name: '設定' })
    await expect(heading).toBeFocused()

    // テーマ: ダークにすると、settings.json と OS 側のテーマ（ページの prefers-color-scheme）に効く
    await window.getByLabel('ダーク').check()
    await expect.poll(() => saved().theme).toBe('dark')
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)).toBe(true)
    // UI はダークの色になる
    await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(
      await window.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg')
      )
    ).toBe('#18181b')
    await window.screenshot({ path: `test-results/settings-${process.platform}.png` })

    // 整数の欄: 範囲内なら Enter で書く。範囲外は知らせて書かない
    const days = window.getByLabel('履歴の保存期間（日）')
    await days.fill('30')
    await days.press('Enter')
    await expect.poll(() => saved().historyRetentionDays).toBe(30)
    // 書いた後もフォーカスは欄に残る
    await expect(days).toBeFocused()
    // 打っている途中（空）では知らせない
    await days.fill('')
    await expect(days).not.toHaveAttribute('aria-invalid', 'true')
    await days.fill('0')
    await days.press('Enter')
    await expect(window.getByText('1〜3650 の整数で入力してください。')).toBeVisible()
    await expect(days).toHaveAttribute('aria-invalid', 'true')
    expect(saved().historyRetentionDays).toBe(30)

    // 手で編集したら、画面も変わる
    writeFileSync(file, JSON.stringify({ ...saved(), showDeveloperHome: false }))
    await expect(
      window.getByLabel('しばらく使っていなかったら Developer Home を出す')
    ).not.toBeChecked()
    await expect(window.getByLabel('Developer Home を出すまでの時間（分）')).toBeDisabled()

    // ライトにすると戻る
    await window.getByLabel('ライト').check()
    await expect(window.locator('html')).toHaveAttribute('data-theme', 'light')

    // Esc で閉じると、ページの画面に戻り、フォーカスは今の Workspace の行へ
    await window.keyboard.press('Escape')
    await expect(heading).toHaveCount(0)
    await expect(window.locator('.workspace-row[aria-current="true"]')).toBeFocused()
  } finally {
    await app.close()
    cleanup()
  }
})

test('設定の画面: Developer Home の上で開いてもタブ列は出さず、閉じると Developer Home に戻る', async () => {
  const first = await launchApp()
  try {
    {
      const window = await appWindow(first.app)
      await window.getByLabel('名前').fill('案件A')
      await window.getByRole('button', { name: '作成' }).click()
      await expect(window.locator('.workspace-row')).toHaveCount(1)
      await first.app.close()
    }
    // 前回の終了を 2 時間前にして、Developer Home の起動にする
    const db = new DatabaseSync(join(first.userDataDir, 'trueful.db'))
    db.prepare('UPDATE app_state SET last_quit_time_ms = ?').run(Date.now() - 120 * 60_000)
    db.close()
    const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
    const window = await appWindow(app)
    const home = window.getByRole('region', { name: 'Developer Home' })
    await expect(home).toBeVisible()
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('open-settings')!.click()
    )
    await expect(window.getByRole('heading', { name: '設定' })).toBeVisible()
    await expect(window.locator('.tab-row')).toHaveCount(0)
    await window.keyboard.press('Escape')
    await expect(home).toBeVisible()
    await app.close()
  } finally {
    first.cleanup()
  }
})

test('設定の画面: 近道を足す・消す。正しくない近道は理由を知らせて足さない', async () => {
  const { app, userDataDir, cleanup } = await launchApp()
  const file = join(userDataDir, 'settings.json')
  const keywords = (): string[] =>
    (JSON.parse(readFileSync(file, 'utf8')).shortcuts as { keyword: string }[]).map(
      (s) => s.keyword
    )
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('open-settings')!.click()
    )
    const keyword = window.getByLabel('キーワード')
    const url = window.getByLabel('URL（%s が語に置き換わる）')

    // 数字だけは localhost の近道とぶつかるので足さない
    await keyword.fill('8080')
    await url.fill('https://example.com/?q=%s')
    await window.getByRole('button', { name: '追加', exact: true }).click()
    await expect(window.getByText('localhost の近道に使われている')).toBeVisible()
    expect(keywords()).toEqual(['gh', 'npm', 'mdn'])

    // 正しいものは足し、欄を空にする
    // 大文字は小文字にして足す（統合検索欄は小文字で照らし合わせる）
    await keyword.fill('Docs')
    await url.press('Enter')
    await expect.poll(keywords).toEqual(['gh', 'npm', 'mdn', 'docs'])
    await expect(keyword).toHaveValue('')
    await expect(window.getByText('https://example.com/?q=%s')).toBeVisible()

    // 消す
    await window.getByRole('button', { name: '近道「gh」を削除' }).click()
    await expect.poll(keywords).toEqual(['npm', 'mdn', 'docs'])
    await expect(window.getByRole('button', { name: '近道「gh」を削除' })).toHaveCount(0)
    // フォーカスは次の行の削除ボタンへ
    await expect(window.getByRole('button', { name: '近道「npm」を削除' })).toBeFocused()
    await window.screenshot({ path: `test-results/settings-shortcuts-${process.platform}.png` })
  } finally {
    await app.close()
    cleanup()
  }
})

test('設定の画面: 記憶したサイトの権限を、左パネルの並びで Workspace の名前つきで出し、取り消せる', async () => {
  const first = await launchApp()
  try {
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
    // 案件A で通知を許可・案件B でカメラをブロックしたことにし、左パネルで案件B を上にする
    const db = new DatabaseSync(join(first.userDataDir, 'trueful.db'))
    const insert = db.prepare(
      'INSERT INTO site_permission (workspace_id, origin, permission, decision, decided_time_ms) VALUES (?, ?, ?, ?, 1)'
    )
    insert.run(1, 'https://a.example', 'notifications', 'allow')
    insert.run(2, 'https://b.example', 'camera', 'deny')
    db.prepare('UPDATE workspace SET position = CASE id WHEN 1 THEN 1 ELSE 0 END').run()
    db.close()

    const { app } = await launchApp(undefined, { userDataDir: first.userDataDir })
    const window = await appWindow(app)
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('open-settings')!.click()
    )
    const section = window.getByRole('group', { name: 'サイトの権限' })
    const rows = section.getByRole('listitem')
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toContainText('案件B')
    await expect(rows.last()).toContainText('案件A')
    await section.scrollIntoViewIfNeeded()
    await window.screenshot({ path: `test-results/settings-permissions-${process.platform}.png` })

    // 取り消すと、行が消え、フォーカスは残りの行のボタンへ
    await section
      .getByRole('button', { name: '案件B の https://b.example の「カメラ」の記憶を取り消す' })
      .click()
    await expect(rows).toHaveCount(1)
    await expect(section.getByRole('button', { name: /案件A/ })).toBeFocused()
    // 最後の1件を取り消すと、空の知らせが出て、フォーカスはまとまりへ
    await section.getByRole('button', { name: /案件A/ }).click()
    await expect(section.getByText('記憶しているサイトの権限はありません。')).toBeVisible()
    await expect(section).toBeFocused()
    const left = await window.evaluate(async () => {
      const r = await (
        window as unknown as { trueful: Window['trueful'] }
      ).trueful.permission.list()
      return r.ok ? r.value.length : -1
    })
    expect(left).toBe(0)
    await app.close()
  } finally {
    first.cleanup()
  }
})
