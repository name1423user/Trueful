import { expect, test, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { launchApp } from './launchApp'

// テスト用のページ（ローカルの HTTP サーバー。外のネットワークには出ない）。
// /set?v=<値> は、再起動しても残る Cookie（Max-Age つき）を置く。
// ほかのパスは、届いた Cookie をタイトルに出す（「cookie:<Cookie ヘッダー> <パス>」）
let server: Server
let origin: string
const userAgents: string[] = []
test.beforeAll(async () => {
  server = createServer((req, res) => {
    userAgents.push(req.headers['user-agent'] ?? '')
    const url = new URL(req.url ?? '/', 'http://localhost')
    res.setHeader('content-type', 'text/html; charset=utf-8')
    if (url.pathname === '/set') {
      res.setHeader('set-cookie', `sid=${url.searchParams.get('v')}; Max-Age=86400; Path=/`)
      res.end(`<!doctype html><title>set ${url.searchParams.get('v')}</title>`)
      return
    }
    const cookie = req.headers.cookie ?? 'none'
    res.end(`<!doctype html><title>cookie:${cookie} ${req.url}</title>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

type Api = { trueful: Window['trueful'] }

// CI の macOS・Windows では、最初のページの読み込み（パーティションの作成を含む）が遅いことがある
const POLL = { timeout: 15_000 }

// Workspace を作り（作った Workspace が今のものになる）、その選択中のタブの id を返す
async function createWorkspace(window: Page, name: string): Promise<{ ws: number; tab: number }> {
  return window.evaluate(async (n) => {
    const api = (window as unknown as Api).trueful
    const r = await api.workspace.create({
      name: n,
      mode: 'custom',
      requestId: crypto.randomUUID()
    })
    if (!r.ok) throw new Error(r.error.message)
    await api.view.setBounds({ x: 0, y: 80, width: 800, height: 600 })
    const tabs = await api.tab.list(r.value.id)
    if (!tabs.ok || tabs.value.activeId === null) throw new Error('タブがない')
    return { ws: r.value.id, tab: tabs.value.activeId }
  }, name)
}

async function navigate(window: Page, ws: number, tab: number, input: string): Promise<void> {
  await window.evaluate(
    async ([w, t, i]) => {
      const r = await (window as unknown as Api).trueful.tab.navigate(w, t, i)
      if (!r.ok) throw new Error(r.error.message)
    },
    [ws, tab, input] as const
  )
}

// タブのタイトル（読み込みの完了はタイトルで待つ）
function title(window: Page, ws: number, tab: number): Promise<string | undefined> {
  return window.evaluate(
    async ([w, t]) => {
      const r = await (window as unknown as Api).trueful.tab.list(w)
      if (!r.ok) throw new Error(r.error.message)
      return r.value.tabs.find((x) => x.id === t)?.title
    },
    [ws, tab] as const
  )
}

test('Workspace A の Cookie は B から見えず、再起動しても A に残る。ページの User-Agent に Electron/ を含めない', async () => {
  // 起動を2回含むので長めにする
  test.setTimeout(90_000)
  const first = await launchApp()
  let a: { ws: number; tab: number }
  let b: { ws: number; tab: number }
  try {
    const window = await first.app.firstWindow()
    a = await createWorkspace(window, 'A')
    await navigate(window, a.ws, a.tab, `${origin}/set?v=A`)
    await expect.poll(() => title(window, a.ws, a.tab), POLL).toBe('set A')

    b = await createWorkspace(window, 'B')
    await navigate(window, b.ws, b.tab, `${origin}/whoami`)
    await expect.poll(() => title(window, b.ws, b.tab), POLL).toBe('cookie:none /whoami')
    // A のページ（今は隠れている）には、A の Cookie が届く
    await navigate(window, a.ws, a.tab, `${origin}/whoami`)
    await expect.poll(() => title(window, a.ws, a.tab), POLL).toBe('cookie:sid=A /whoami')

    // T0-1 の結果（B: Electron/ を除く）。ページの navigator.userAgent も同じ
    expect(userAgents.length).toBeGreaterThan(0)
    for (const ua of userAgents) {
      expect(ua).toContain('Chrome/')
      expect(ua).not.toMatch(/Electron\//)
    }
    const pageUa = await first.app.evaluate(({ webContents }, o) => {
      const page = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith(o))
      return page?.executeJavaScript('navigator.userAgent', true)
    }, origin)
    expect(pageUa).toContain('Chrome/')
    expect(pageUa).not.toMatch(/Electron\//)
  } catch (e) {
    await first.app.close()
    first.cleanup()
    throw e
  }
  await first.app.close()

  // 同じ保存場所で起動し直す（保存場所は、起動に失敗しても最後に消す）
  try {
    const second = await launchApp(undefined, { userDataDir: first.userDataDir })
    try {
      const window = await second.app.firstWindow()
      await window.evaluate(async (w) => {
        const api = (window as unknown as Api).trueful
        await api.view.setBounds({ x: 0, y: 80, width: 800, height: 600 })
        const r = await api.workspace.switch(w)
        if (!r.ok) throw new Error(r.error.message)
      }, a.ws)
      await navigate(window, a.ws, a.tab, `${origin}/whoami?after-restart`)
      await expect
        .poll(() => title(window, a.ws, a.tab), POLL)
        .toBe('cookie:sid=A /whoami?after-restart')

      await window.evaluate(async (w) => {
        const r = await (window as unknown as Api).trueful.workspace.switch(w)
        if (!r.ok) throw new Error(r.error.message)
      }, b.ws)
      await navigate(window, b.ws, b.tab, `${origin}/whoami?after-restart`)
      await expect
        .poll(() => title(window, b.ws, b.tab), POLL)
        .toBe('cookie:none /whoami?after-restart')
    } finally {
      await second.app.close()
    }
  } finally {
    first.cleanup()
  }
})
