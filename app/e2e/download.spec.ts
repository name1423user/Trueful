import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appWindow, launchApp } from './launchApp'

let server: Server
let origin: string
test.beforeAll(async () => {
  server = createServer((req, res) => {
    // 何度開いても、同じ名前のファイルをダウンロードさせる
    res.setHeader('content-type', 'application/octet-stream')
    res.setHeader('content-disposition', 'attachment; filename="report.txt"')
    res.end(`hello ${req.url}`)
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

test('ページのダウンロードは Workspace のフォルダに保存され、記録される。同名は連番になる', async () => {
  test.setTimeout(90_000)
  const downloads = mkdtempSync(join(tmpdir(), 'trueful-e2e-dl-'))
  const env = { TRUEFUL_DOWNLOADS_DIR: downloads }
  const first = await launchApp(undefined, { env })
  try {
    const window = await appWindow(first.app)
    await window.getByLabel('名前').fill('案件/A')
    await window.getByRole('button', { name: '作成' }).click()
    const address = window.getByLabel('アドレス')
    const list = (): Promise<{ path: string; state: string; receivedBytes: number }[]> =>
      window.evaluate(async () => {
        const r = await (window as unknown as Api).trueful.download.list()
        if (!r.ok) throw new Error(r.error.message)
        return r.value.map((d) => ({
          path: d.path,
          state: d.state,
          receivedBytes: d.receivedBytes
        }))
      })
    const completed = async (): Promise<number> =>
      (await list()).filter((d) => d.state === 'completed').length
    // 1件が終わってから次を始める（続けて移動すると、最初のダウンロードが始まる前に、次の移動で置き換わる）
    let expected = 0
    for (const path of ['/one', '/two']) {
      await address.fill(`${origin}${path}`)
      await address.press('Enter')
      expected++
      try {
        await expect.poll(completed, { timeout: 30_000 }).toBe(expected)
      } catch (e) {
        // 失敗したときに、記録の中身が分かるように
        throw new Error(`${path}: ${JSON.stringify(await list())}`, { cause: e })
      }
    }
    const paths = (await list()).map((d) => d.path.replaceAll('\\', '/')).sort()
    // フォルダ名は無害化（/ は _）。同名は連番
    expect(paths).toEqual([
      `${downloads.replaceAll('\\', '/')}/Trueful/案件_A/report (1).txt`,
      `${downloads.replaceAll('\\', '/')}/Trueful/案件_A/report.txt`
    ])
    for (const path of (await list()).map((d) => d.path)) expect(existsSync(path)).toBe(true)
    expect(readFileSync(join(downloads, 'Trueful', '案件_A', 'report.txt'), 'utf8')).toMatch(
      /^hello \/(one|two)$/
    )
  } finally {
    await first.app.close()
    first.cleanup()
    rmSync(downloads, { recursive: true, force: true })
  }
})
