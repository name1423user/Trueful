import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// E2E ごとに空の保存場所（userData）を作って起動する。普段使っている DB や設定に触れないため。
// 終わったら app.close() のあとで cleanup() を呼び、保存場所を消す。
// prepare で、起動の前に保存場所へファイルを置ける（壊れた settings.json など）。
// userDataDir を渡すと、その保存場所で起動する（再起動の確かめ用。cleanup は最後の1回だけ呼ぶ）
export async function launchApp(
  prepare?: (userDataDir: string) => void,
  options: { userDataDir?: string } = {}
): Promise<{
  app: ElectronApplication
  userDataDir: string
  cleanup: () => void
}> {
  const userDataDir = options.userDataDir ?? mkdtempSync(join(tmpdir(), 'trueful-e2e-'))
  prepare?.(userDataDir)
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
  )
  const app = await electron.launch({
    args: ['.'],
    env: { ...env, TRUEFUL_USER_DATA_DIR: userDataDir }
  })
  // Windows では、閉じた直後の子プロセスがファイルを掴んでいることがあるので、少し待って再試行する
  const cleanup = (): void =>
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  return { app, userDataDir, cleanup }
}

// UI のウィンドウ（preload の API window.trueful があるもの）を返す。
// firstWindow() は使わない。再起動すると、前回のタブのページ（WebContentsView）がすぐ復元され、
// Playwright はそれも「ウィンドウ」として数えるので、そちらが先に返ることがある
export async function appWindow(app: ElectronApplication, timeoutMs = 30_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      const isUi = await page.evaluate(() => 'trueful' in window).catch(() => false)
      if (isUi) return page
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('UI のウィンドウ（window.trueful）が見つからない')
}
