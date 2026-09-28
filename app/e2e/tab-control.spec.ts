import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { launchApp } from './launchApp'

// テスト用のページ（ローカルの HTTP サーバー。外のネットワークには出ない）
let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><title>page ${req.url}</title><p>${req.url}</p>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

test('戻る・進む、window.open は新しいタブ、メニューのショートカットでタブを開く・閉じる・戻す', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    const ws = await window.evaluate(async () => {
      const api = (window as unknown as { trueful: Window['trueful'] }).trueful
      const r = await api.workspace.create({
        name: 'A',
        mode: 'custom',
        requestId: crypto.randomUUID()
      })
      if (!r.ok) throw new Error(r.error.message)
      await api.view.setBounds({ x: 0, y: 80, width: 800, height: 600 })
      return r.value.id
    })
    const tabs = (): Promise<{
      activeUrl: string
      activeTitle: string
      urls: string[]
      activeId: number
    }> =>
      window.evaluate(async (id) => {
        const r = await (window as unknown as { trueful: Window['trueful'] }).trueful.tab.list(id)
        if (!r.ok) throw new Error(r.error.message)
        const active = r.value.tabs.find((t) => t.id === r.value.activeId)!
        return {
          activeUrl: active.url,
          activeTitle: active.title,
          urls: r.value.tabs.map((t) => t.url),
          activeId: active.id
        }
      }, ws)
    const tabId = (await tabs()).activeId
    const navigate = (input: string): Promise<unknown> =>
      window.evaluate(
        ([w, t, i]) =>
          (window as unknown as { trueful: Window['trueful'] }).trueful.tab.navigate(w, t, i),
        [ws, tabId, input] as const
      )
    const control = (action: 'back' | 'forward'): Promise<unknown> =>
      window.evaluate(
        ([w, t, a]) =>
          (window as unknown as { trueful: Window['trueful'] }).trueful.tab.control(w, t, a),
        [ws, tabId, action] as const
      )

    // 戻る・進む（URL は開いた時点で記録されるので、読み込みの完了はタイトルで待つ）
    await navigate(`${origin}/a`)
    await expect.poll(async () => (await tabs()).activeTitle).toBe('page /a')
    await navigate(`${origin}/b`)
    await expect.poll(async () => (await tabs()).activeTitle).toBe('page /b')
    await control('back')
    await expect.poll(async () => (await tabs()).activeUrl).toBe(`${origin}/a`)
    await expect.poll(async () => (await tabs()).activeTitle).toBe('page /a')
    await control('forward')
    await expect.poll(async () => (await tabs()).activeUrl).toBe(`${origin}/b`)
    await expect.poll(async () => (await tabs()).activeTitle).toBe('page /b')

    // window.open は、同じ Workspace の新しいタブで開き、Renderer に知らせる
    const changed = window.evaluate(
      () =>
        new Promise<number>((resolve) =>
          (window as unknown as { trueful: Window['trueful'] }).trueful.tab.onListChanged(resolve)
        )
    )
    await app.evaluate(({ webContents }, o) => {
      const page = webContents.getAllWebContents().find((wc) => wc.getURL() === `${o}/b`)
      return page?.executeJavaScript(`window.open('${o}/c')`, true)
    }, origin)
    expect(await changed).toBe(ws)
    await expect.poll(async () => (await tabs()).urls).toEqual([`${origin}/b`, `${origin}/c`])

    // メニューのショートカット（accelerator の項目を押す）
    const click = (id: string): Promise<void> =>
      app.evaluate(({ Menu }, i) => Menu.getApplicationMenu()?.getMenuItemById(i)?.click(), id)
    await click('tab-close')
    await expect.poll(async () => (await tabs()).urls).toEqual([`${origin}/b`])
    await click('tab-reopen')
    await expect.poll(async () => (await tabs()).urls).toEqual([`${origin}/b`, `${origin}/c`])
    await click('tab-new')
    await expect
      .poll(async () => (await tabs()).urls)
      .toEqual([`${origin}/b`, `${origin}/c`, 'about:blank'])
    // アドレスバーへのフォーカスは、画面に知らせる
    const command = window.evaluate(
      () =>
        new Promise<string>((resolve) =>
          (window as unknown as { trueful: Window['trueful'] }).trueful.ui.onCommand(resolve)
        )
    )
    await click('focus-address-bar')
    expect(await command).toBe('focus-address-bar')
  } finally {
    await app.close()
    cleanup()
  }
})
