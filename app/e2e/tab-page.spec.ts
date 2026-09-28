import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { launchApp } from './launchApp'

// テスト用のページ。/a と /b はタイトルだけのページ
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

test('アドレスバーの入力でページを開き、URL とタイトルが記録される。ページは Workspace のパーティションで動く', async () => {
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
    // タブ列（選択中のタブと、全タブの URL）
    const tabs = (): Promise<{
      active: { id: number; url: string; title: string }
      urls: string[]
    }> =>
      window.evaluate(async (id) => {
        const r = await (window as unknown as { trueful: Window['trueful'] }).trueful.tab.list(id)
        if (!r.ok) throw new Error(r.error.message)
        const active = r.value.tabs.find((t) => t.id === r.value.activeId)!
        return { active, urls: r.value.tabs.map((t) => t.url) }
      }, ws)
    const tabId = (await tabs()).active.id
    const navigate = (input: string): Promise<{ url: string }> =>
      window.evaluate(
        async ([w, t, i]) => {
          const api = (window as unknown as { trueful: Window['trueful'] }).trueful
          const r = await api.tab.navigate(w, t, i)
          if (!r.ok) throw new Error(r.error.message)
          return r.value
        },
        [ws, tabId, input] as const
      )
    await navigate(`${origin}/a`)
    await expect.poll(async () => (await tabs()).active.title).toBe('page /a')
    await navigate(`${origin}/b`)
    await expect.poll(async () => (await tabs()).active.url).toBe(`${origin}/b`)

    // http・https 以外は開かず、検索語として扱う
    expect((await navigate('file:///etc/passwd')).url).toMatch(
      /^https:\/\/www\.google\.com\/search\?q=file/
    )
    await navigate(`${origin}/a`)
    await expect.poll(async () => (await tabs()).active.url).toBe(`${origin}/a`)

    // ページは persist:workspace-<id> のセッションで動く（ログインを Workspace で分ける。F03）
    const partitionOk = await app.evaluate(
      ({ session, webContents }, [pageOrigin, id]) => {
        const page = webContents
          .getAllWebContents()
          .find((wc) => wc.getURL().startsWith(pageOrigin))
        return page?.session === session.fromPartition(`persist:workspace-${id}`)
      },
      [origin, ws] as const
    )
    expect(partitionOk).toBe(true)
  } finally {
    await app.close()
    cleanup()
  }
})
