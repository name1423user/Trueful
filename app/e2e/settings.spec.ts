import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp } from './launchApp'

test('UI から settings の取得と更新ができ、不正な更新はエラーが返る', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    const results = await window.evaluate(async () => {
      const api = (window as unknown as { trueful: Window['trueful'] }).trueful.settings
      const before = await api.get()
      const updated = await api.update({ theme: 'dark' })
      const after = await api.get()
      const invalid = await api.update({ theme: 'blue' } as never)
      return { before, updated, after, invalid }
    })
    expect(results.before).toMatchObject({ ok: true, value: { settings: { theme: 'system' } } })
    expect(results.updated).toMatchObject({ ok: true, value: { theme: 'dark' } })
    expect(results.after).toMatchObject({ ok: true, value: { settings: { theme: 'dark' } } })
    expect(results.invalid).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
  } finally {
    await app.close()
    cleanup()
  }
})

test('settings.json が壊れていたら、既定値で起動し、問題を Renderer に伝える', async () => {
  const { app, cleanup } = await launchApp((dir) =>
    writeFileSync(join(dir, 'settings.json'), '{ broken')
  )
  try {
    const window = await app.firstWindow()
    const result = await window.evaluate(() =>
      (window as unknown as { trueful: Window['trueful'] }).trueful.settings.get()
    )
    expect(result).toMatchObject({
      ok: true,
      value: { settings: { theme: 'system' }, problem: { kind: 'invalid-json' } }
    })
  } finally {
    await app.close()
    cleanup()
  }
})
