import { expect, test } from '@playwright/test'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { launchApp } from './launchApp'

test('起動すると、指定した保存場所に DB とバックアップができる（Electron の中の node:sqlite で動く）', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    await app.firstWindow()
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(userDataDir)
    await expect.poll(() => existsSync(join(userDataDir, 'trueful.db.bak'))).toBe(true)
  } finally {
    await app.close()
  }

  const db = new DatabaseSync(join(userDataDir, 'trueful.db'), { readOnly: true })
  try {
    expect(db.prepare('PRAGMA quick_check').get()?.['quick_check']).toBe('ok')
  } finally {
    db.close()
  }
  rmSync(userDataDir, { recursive: true, force: true })
})
