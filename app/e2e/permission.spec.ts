import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { appWindow, launchApp } from './launchApp'

let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><title>page ${req.url}</title>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
test.afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
)

type Api = { trueful: Window['trueful'] }

// ページで JavaScript を動かす（ユーザーの操作として。通知の確認には要る）
async function runInPage(
  app: Awaited<ReturnType<typeof launchApp>>['app'],
  prefix: string,
  code: string
): Promise<unknown> {
  return app.evaluate(
    async ({ webContents }, { prefix, code }) => {
      const page = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith(prefix))
      return page?.executeJavaScript(code, true)
    },
    { prefix, code }
  )
}

test('権限の確認: アドレスバーの下の帯で、許可・ブロックは記憶し、「今は決めない」は拒否して記憶しない。不正な引数は拒否', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await appWindow(app)
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    await address.fill(`${origin}/geo`)
    await address.press('Enter')
    await expect(window.locator('.tab-row').first()).toHaveText('page /geo', { timeout: 15_000 })
    const pageTop = await window
      .getByTestId('page-area')
      .evaluate((e) => e.getBoundingClientRect().top)

    // 通知を求める → 帯が出て、ページの場所は帯の分だけ下がる → 許可
    await runInPage(app, origin, `window.notify = Notification.requestPermission(); 0`)
    const bar = window.getByRole('region', { name: 'サイトの権限の確認' })
    await expect(bar).toContainText(`${origin} が「通知」を使おうとしています`)
    await expect
      .poll(() => window.getByTestId('page-area').evaluate((e) => e.getBoundingClientRect().top))
      .toBeGreaterThan(pageTop)
    await window.screenshot({ path: `test-results/permission-prompt-${process.platform}.png` })
    await bar.getByRole('button', { name: '許可' }).click()
    await expect(bar).toHaveCount(0)
    expect(await runInPage(app, origin, `window.notify`)).toBe('granted')

    // 位置情報を求める → ブロック（PERMISSION_DENIED = 1）
    const geo = `new Promise((resolve) => navigator.geolocation.getCurrentPosition(() => resolve('allowed'), (e) => resolve(e.code)))`
    await runInPage(app, origin, `window.geo = ${geo}; 0`)
    await expect(bar).toContainText('「位置情報」')
    await bar.getByRole('button', { name: 'ブロック' }).click()
    expect(await runInPage(app, origin, `window.geo`)).toBe(1)

    // 記憶した答えは、もう確認しない（同じサイトの位置情報は、すぐ拒否）
    expect(await runInPage(app, origin, geo)).toBe(1)

    // 別のサイト（localhost）の位置情報 → 今は決めない → 拒否して、記憶しない
    const other = origin.replace('127.0.0.1', 'localhost')
    await address.fill(`${other}/geo2`)
    await address.press('Enter')
    await expect(window.locator('.tab-row').first()).toHaveText('page /geo2', { timeout: 15_000 })
    // 2つ続けて求められたら、1つずつ出す。入れ替わった直後の帯は、少しの間押せない（連打で次に答えない）
    await runInPage(
      app,
      other,
      `window.geo = ${geo}; window.notify = Notification.requestPermission(); 0`
    )
    await expect(bar).toContainText(`${other} が「位置情報」`)
    await bar.getByRole('button', { name: '今は決めない' }).click()
    await expect(bar).toContainText('「通知」')
    await expect(bar.getByRole('button', { name: '許可' })).toBeDisabled()
    await bar.getByRole('button', { name: '今は決めない' }).click()
    expect(await runInPage(app, other, `window.geo`)).toBe(1)
    expect(await runInPage(app, other, `window.notify`)).toBe('denied')

    // 確認はタブに結びつく。別のタブを選ぶと帯は消え、戻ると出る。タブを閉じると、確認も終わる
    await runInPage(app, other, `window.geo = ${geo}; 0`)
    await expect(bar).toContainText('「位置情報」')
    await window.getByRole('button', { name: '新しいタブ' }).click()
    await expect(window.locator('.tab-row')).toHaveCount(2)
    await expect(bar).toHaveCount(0)
    await window.locator('.tab-row').first().click()
    await expect(bar).toContainText('「位置情報」')
    await window.getByRole('button', { name: 'page /geo2 を閉じる' }).click()
    await expect(bar).toHaveCount(0)

    const result = await window.evaluate(async () => {
      const api = (window as unknown as Api).trueful.permission
      const list = await api.list()
      const answered = await api.answer(999, 'allow')
      const waiting = await api.prompts()
      const bad = await api.revoke({
        workspaceId: 1,
        origin: 'file:///x',
        permission: 'camera'
      })
      return { list, answered, waiting, bad }
    })
    expect(
      result.list.ok && result.list.value.map((p) => [p.origin, p.permission, p.decision])
    ).toEqual(
      expect.arrayContaining([
        [origin, 'notifications', 'allow'],
        [origin, 'geolocation', 'deny']
      ])
    )
    expect(result.list.ok && result.list.value).toHaveLength(2)
    expect(result.answered).toMatchObject({ ok: true, value: false })
    expect(result.waiting).toMatchObject({ ok: true, value: [] })
    expect(result.bad).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
  } finally {
    await app.close()
    cleanup()
  }
})
