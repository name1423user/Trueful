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

    // 知らせを記録しておく（操作より先に登録する）
    await window.evaluate(() => {
      const w = window as unknown as {
        trueful: Window['trueful']
        received: { list: number[]; commands: string[] }
      }
      w.received = { list: [], commands: [] }
      w.trueful.tab.onListChanged((id) => w.received.list.push(id))
      w.trueful.ui.onCommand((c) => w.received.commands.push(c))
    })
    const received = (): Promise<{ list: number[]; commands: string[] }> =>
      window.evaluate(
        () => (window as unknown as { received: { list: number[]; commands: string[] } }).received
      )

    // ユーザーの入力なしの window.open は開かない（ポップアップを止める）
    const openFromPage = (withInput: boolean): Promise<unknown> =>
      app.evaluate(
        async ({ webContents }, [o, input]) => {
          const page = webContents.getAllWebContents().find((wc) => wc.getURL() === `${o}/b`)
          if (!page) throw new Error('ページがない')
          if (input) {
            page.sendInputEvent({ type: 'mouseDown', x: 10, y: 10, button: 'left', clickCount: 1 })
            page.sendInputEvent({ type: 'mouseUp', x: 10, y: 10, button: 'left', clickCount: 1 })
          }
          return page.executeJavaScript(`window.open('${o}/c')`, true)
        },
        [origin, withInput] as const
      )
    await openFromPage(false)
    await window.waitForTimeout(300)
    expect((await tabs()).urls).toEqual([`${origin}/b`])

    // 入力の直後なら、同じ Workspace の新しいタブで開き、Renderer に知らせる
    await openFromPage(true)
    await expect.poll(async () => (await tabs()).urls).toEqual([`${origin}/b`, `${origin}/c`])
    await expect.poll(async () => (await received()).list).toEqual([ws])

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
    // アドレスバー・統合検索へのフォーカスは、画面に知らせる
    await click('focus-address-bar')
    await click('focus-search')
    await expect
      .poll(async () => (await received()).commands)
      .toEqual(['focus-address-bar', 'focus-search'])
  } finally {
    await app.close()
    cleanup()
  }
})
