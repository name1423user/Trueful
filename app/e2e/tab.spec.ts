import { expect, test } from '@playwright/test'
import { launchApp } from './launchApp'

test('Workspace を作ると空のタブが1つ開き、preload の API でタブを開く・閉じる・戻す・選べる', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    const r = await window.evaluate(async () => {
      const { workspace, tab } = (window as unknown as { trueful: Window['trueful'] }).trueful
      const created = await workspace.create({
        name: '案件A',
        mode: 'custom',
        requestId: crypto.randomUUID()
      })
      if (!created.ok) throw new Error(created.error.message)
      const ws = created.value.id
      const first = await tab.list(ws)
      const second = await tab.create(ws)
      if (!second.ok) throw new Error(second.error.message)
      const closed = await tab.close(second.value.id)
      const reopened = await tab.reopenClosed(ws)
      const nothing = await tab.reopenClosed(ws)
      const activated = await tab.activate(first.ok ? first.value.tabs[0]!.id : -1)
      const last = await tab.list(ws)
      return {
        first,
        closedCount: closed.ok ? closed.value.tabs.length : -1,
        reopened,
        nothing,
        activated: activated.ok,
        last,
        missingWorkspace: await tab.list(9999),
        missingTab: await tab.close(9999),
        badArgs: await tab.activate(0)
      }
    })
    expect(r.first).toMatchObject({ ok: true, value: { tabs: [{ url: 'about:blank' }] } })
    expect(r.closedCount).toBe(1)
    expect(r.reopened).toMatchObject({ ok: true, value: { url: 'about:blank', position: 1 } })
    expect(r.nothing).toEqual({ ok: true, value: null })
    expect(r.activated).toBe(true)
    expect(r.last.ok && r.last.value.tabs).toHaveLength(2)
    expect(r.last.ok && r.last.value.activeId).toBe(r.first.ok && r.first.value.tabs[0]!.id)
    expect(r.missingWorkspace).toMatchObject({ ok: false, error: { code: 'not-found' } })
    expect(r.missingTab).toMatchObject({ ok: false, error: { code: 'not-found' } })
    expect(r.badArgs).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
  } finally {
    await app.close()
    cleanup()
  }
})
