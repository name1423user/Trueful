import { expect, test, type Page } from '@playwright/test'
import { appWindow, launchApp } from './launchApp'

type Api = { trueful: Window['trueful'] }
type Bm = { id: number; parentId: number | null; kind: string; title: string; url: string | null }

// preload の API を呼び、IpcResult をそのまま返す
const call = <T>(window: Page, fn: string, ...args: unknown[]): Promise<T> =>
  window.evaluate(
    ([name, a]) => {
      const bookmark = (window as unknown as Api).trueful.bookmark as unknown as Record<
        string,
        (...x: unknown[]) => Promise<unknown>
      >
      return bookmark[name as string]!(...(a as unknown[]))
    },
    [fn, args] as const
  ) as Promise<T>

const list = async (window: Page): Promise<Bm[]> => {
  const r = await call<{ ok: true; value: Bm[] }>(window, 'list')
  return r.value
}

test('ブックマークを追加・編集・移動・削除できる。不正な引数と、ない id は拒否する', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    expect(await list(window)).toEqual([])

    const folder = await call<{ ok: true; value: Bm }>(window, 'add', {
      kind: 'folder',
      title: '開発'
    })
    const a = await call<{ ok: true; value: Bm }>(window, 'add', {
      kind: 'url',
      title: 'MDN',
      url: 'https://developer.mozilla.org/',
      parentId: folder.value.id
    })
    expect((await list(window)).map((b) => [b.title, b.parentId])).toEqual([
      ['開発', null],
      ['MDN', folder.value.id]
    ])

    expect(await call(window, 'update', { id: a.value.id, title: 'MDN Web Docs' })).toMatchObject({
      ok: true
    })
    expect((await list(window)).find((b) => b.id === a.value.id)!.title).toBe('MDN Web Docs')

    expect(await call(window, 'move', a.value.id, null)).toMatchObject({ ok: true })
    expect((await list(window)).find((b) => b.id === a.value.id)!.parentId).toBeNull()
    // 自分の中へは移せない
    expect(await call(window, 'move', folder.value.id, folder.value.id)).toMatchObject({
      ok: false
    })

    // 不正な引数・ない id
    expect(
      await call(window, 'add', { kind: 'url', title: 'x', url: 'javascript:alert(1)' })
    ).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
    expect(await call(window, 'delete', 9999)).toMatchObject({
      ok: false,
      error: { code: 'not-found' }
    })

    // フォルダを消すと中身も消える
    expect(await call(window, 'delete', folder.value.id)).toMatchObject({ ok: true })
    expect((await list(window)).map((b) => b.title)).toEqual(['MDN Web Docs'])
  } finally {
    await app.close()
    cleanup()
  }
})
