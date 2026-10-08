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
    res.end(`<!doctype html><title>page ${req.url}</title><body><h1>${req.url}</h1></body>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

test('統合検索欄: 候補が出て、矢印と Enter で選べる。答えはコピー、Esc で閉じる、ページは候補の分だけ下がる', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const tabs = window.locator('.tab-row')
    const address = window.getByLabel('アドレス')
    await address.fill(`${origin}/alpha`)
    await address.press('Enter')
    await expect(tabs.first()).toHaveText('page /alpha')

    // 新しい空のタブで、alpha と打つと、開いているタブが候補に出る（Web 検索が最後）
    await window.getByRole('button', { name: '新しいタブ' }).click()
    await expect(tabs).toHaveCount(2)
    const closedTop = (await window.getByTestId('page-area').boundingBox())!.y
    await address.fill('alpha')
    const list = window.getByRole('listbox', { name: '候補' })
    const options = list.getByRole('option')
    await expect(options.first()).toContainText('page /alpha')
    await expect(options.last()).toContainText('検索')
    // 何も選んでいない間は、Enter で Web 検索になる（答えや候補を勝手に選ばない）
    await expect(options.first()).toHaveAttribute('aria-selected', 'false')

    // ページ（WebContentsView）は、候補の一覧の分だけ下がり、空の div と同じ位置・大きさに置かれる
    await expect
      .poll(async () => (await window.getByTestId('page-area').boundingBox())!.y)
      .toBeGreaterThan(closedTop + 20)
    const area = (await window.getByTestId('page-area').boundingBox())!
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => {
          const views = BrowserWindow.getAllWindows()[0]!.contentView.children
          return views.at(-1)?.getBounds().y
        })
      )
      .toBe(Math.round(area.y))

    // スクリーンショット（CI の成果物 screenshots-*）。一覧が出て、ページが下がっている
    await address.press('ArrowDown')
    await window.screenshot({ path: `test-results/omnibox-ui-${process.platform}.png` })
    await address.press('ArrowUp')
    await address.press('ArrowDown')

    // 候補の更新は 16ms 以内（性能予算。入力のイベントから、一覧の表示が変わるまで。7 回の中央値）
    const updateMs = await window.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>('input[name="address"]')!
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      const times: number[] = []
      for (const text of ['al', 'alp', 'alph', 'alpha', 'alp', 'al', 'alpha']) {
        const main = document.querySelector('main')!
        const changed = new Promise<void>((resolve) => {
          const observer = new MutationObserver(() => {
            // 一覧の中身が、打った文字に合う候補（Web 検索の見出し）に変わった
            const last = main.querySelector('li:last-child .omnibox-title')?.textContent
            if (last !== text) return
            observer.disconnect()
            resolve()
          })
          observer.observe(main, { childList: true, subtree: true, characterData: true })
        })
        const started = performance.now()
        setter.call(input, text)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await changed
        times.push(performance.now() - started)
      }
      return times.sort((a, b) => a - b)[3]!
    })
    expect(updateMs).toBeLessThan(16)

    // 矢印キーで選び、Enter で開く。開いているタブへ切り替わる
    await address.press('ArrowDown')
    await expect(options.first()).toHaveAttribute('aria-selected', 'true')
    await expect(address).toHaveAttribute('aria-activedescendant', /.+/)
    await address.press('Enter')
    await expect(tabs.first()).toHaveAttribute('aria-current', 'true')
    await expect(list).toBeHidden()
    expect((await window.getByTestId('page-area').boundingBox())!.y).toBeLessThan(closedTop + 2)

    // その場の答え: 矢印で選んで Enter を押すと、結果がクリップボードにコピーされる
    await address.fill('1+2')
    await expect(options.first()).toContainText('3')
    await address.press('ArrowDown')
    await address.press('Enter')
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('3')
    await expect(window.getByRole('status').filter({ hasText: 'コピーしました' })).toHaveCount(1)

    // Esc: 1回目は一覧だけ閉じて打った文字を残し、2回目で元の URL に戻る
    await address.fill('alpha')
    await expect(list).toBeVisible()
    await address.press('Escape')
    await expect(list).toBeHidden()
    await expect(address).toHaveValue('alpha')
    await address.press('Escape')
    await expect(address).toHaveValue(`${origin}/alpha`)
  } finally {
    await app.close()
    cleanup()
  }
})

test('統合検索欄: 他の Workspace の候補は Mode の印と名前が付き、選ぶとその Workspace へ切り替えてから開く', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    await address.fill(`${origin}/alpha`)
    await address.press('Enter')
    await expect(window.locator('.tab-row').first()).toHaveText('page /alpha')

    await window.getByRole('button', { name: 'Workspace を追加' }).click()
    await window.getByLabel('名前').fill('案件B')
    await window.getByLabel('Production（本番）').check()
    await window.getByRole('button', { name: '作成' }).click()
    const rows = window.locator('.workspace-row')
    await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')

    // 案件B で alpha を探すと、案件A のタブが候補に出る（案件A の名前つき）
    await address.fill('alpha')
    const option = window.getByRole('option').filter({ hasText: 'page /alpha' })
    await expect(option).toContainText('案件A')
    await address.press('ArrowDown')
    await address.press('Enter')
    // 案件A へ切り替わり、そのタブが選ばれる
    await expect(rows.nth(0)).toHaveAttribute('aria-current', 'true')
    await expect(window.locator('.tab-row').first()).toHaveAttribute('aria-current', 'true')
    await expect(address).toHaveValue(`${origin}/alpha`)

    // Workspace の名前でも候補が出て、選ぶと切り替わる
    await address.fill('案件B')
    await expect(window.getByRole('option').filter({ hasText: '案件B' }).first()).toBeVisible()
    await address.press('ArrowDown')
    await address.press('Enter')
    await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')
  } finally {
    await app.close()
    cleanup()
  }
})

test('統合検索欄: ↑ は最後の候補から始まる。多い候補でも選んでいる行が見える。コピーの結果は目に見える。スクロールバーを押しても閉じない', async () => {
  const { app, cleanup } = await launchApp()
  try {
    const window = await app.firstWindow()
    await window.getByLabel('名前').fill('案件A')
    await window.getByRole('button', { name: '作成' }).click()
    const tabs = window.locator('.tab-row')
    const address = window.getByLabel('アドレス')
    // 候補が一覧の高さに収まらないほど多い状態にする（タブ 12 個）
    for (let i = 0; i < 12; i++) {
      await address.fill(`${origin}/many${i}`)
      await address.press('Enter')
      await expect(tabs.last()).toHaveText(`page /many${i}`)
      if (i < 11) await window.getByRole('button', { name: '新しいタブ' }).first().click()
    }
    await window.getByRole('button', { name: '新しいタブ' }).first().click()
    await address.fill('many')
    const options = window.getByRole('option')
    await expect(options.last()).toContainText('検索')

    // 一覧を2行ぶんの高さにして、溢れさせる（候補は種類ごとに上限があり、普通は一覧に収まるため）
    await window.getByRole('listbox').evaluate((el) => (el.style.maxHeight = '72px'))
    // 何も選んでいないときの ↑ は、最後の候補（Web 検索）を選ぶ
    await address.press('ArrowUp')
    await expect(options.last()).toHaveAttribute('aria-selected', 'true')
    // 選んでいる行は、一覧の見える範囲に入っている
    const inView = (): Promise<boolean> =>
      window.evaluate(() => {
        const row = document.querySelector('[role="option"][aria-selected="true"]')!
        const list = document.querySelector('[role="listbox"]')!
        const r = row.getBoundingClientRect()
        const l = list.getBoundingClientRect()
        return r.top >= l.top - 1 && r.bottom <= l.bottom + 1
      })
    await expect.poll(inView).toBe(true)
    for (let i = 0; i < 9; i++) {
      await address.press('ArrowUp')
      await expect.poll(inView).toBe(true)
    }

    // コピーの結果は、目に見える形でも出る（しばらくして消える）
    await address.fill('1+2')
    await address.press('ArrowDown')
    await address.press('Enter')
    await expect(window.locator('.omnibox-copied')).toHaveText('コピーしました: 3')
    await expect(window.locator('.omnibox-copied')).toBeHidden({ timeout: 6000 })

    // 一覧のスクロールバーなど、候補の外を押しても一覧は閉じない
    await address.fill('many')
    const list = window.getByRole('listbox', { name: '候補' })
    await expect(list).toBeVisible()
    const box = (await list.boundingBox())!
    await window.mouse.move(box.x + box.width - 2, box.y + 10)
    await window.mouse.down()
    await window.mouse.up()
    await expect(list).toBeVisible()
  } finally {
    await app.close()
    cleanup()
  }
})
