import { expect, test } from '@playwright/test'
import { launchApp } from './launchApp'

test('preload の API で Workspace を作り、一覧し、切り替えられる（二度押しでも1つ、切り替えは 300ms 以内）', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    const r = await window.evaluate(async () => {
      const api = (window as unknown as { trueful: Window['trueful'] }).trueful.workspace
      const empty = await api.list()
      const requestId = crypto.randomUUID()
      // 二度押し（同じ依頼を同時に2回）
      const [a1, a2] = await Promise.all([
        api.create({ name: '案件A', mode: 'production', requestId }),
        api.create({ name: '案件A', mode: 'production', requestId })
      ])
      const b = await api.create({
        name: '案件B',
        mode: 'development',
        requestId: crypto.randomUUID()
      })
      const listed = await api.list()
      const started = performance.now()
      const switched = await api.switch(a1.ok ? a1.value.id : -1)
      const switchMs = performance.now() - started
      const missing = await api.switch(9999)
      const blank = await api.create({
        name: '   ',
        mode: 'custom',
        requestId: crypto.randomUUID()
      })
      return { empty, a1, a2, b, listed, switched, switchMs, missing, blank }
    })
    expect(r.empty).toEqual({ ok: true, value: { workspaces: [], currentId: null } })
    expect(r.a1.ok && r.a2.ok && r.a1.value.id === r.a2.value.id).toBe(true)
    expect(r.listed.ok && r.listed.value.workspaces.map((w) => w.name)).toEqual(['案件A', '案件B'])
    expect(r.listed.ok && r.b.ok && r.listed.value.currentId).toBe(r.b.ok && r.b.value.id)
    expect(r.switched).toMatchObject({ ok: true, value: { name: '案件A' } })
    expect(r.switchMs).toBeLessThan(300)
    expect(r.missing).toMatchObject({ ok: false, error: { code: 'not-found' } })
    expect(r.blank).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
  } finally {
    await app.close()
    cleanup()
  }
})
