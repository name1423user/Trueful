import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// E2E ごとに空の保存場所（userData）を作って起動する。普段使っている DB や設定に触れないため。
// 終わったら app.close() のあとで cleanup() を呼び、保存場所を消す
export async function launchApp(): Promise<{
  app: ElectronApplication
  userDataDir: string
  cleanup: () => void
}> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'trueful-e2e-'))
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
