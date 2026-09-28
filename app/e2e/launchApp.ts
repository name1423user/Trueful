import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// E2E ごとに空の保存場所（userData）を作って起動する。普段使っている DB や設定に触れないため
export async function launchApp(): Promise<{ app: ElectronApplication; userDataDir: string }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'trueful-e2e-'))
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
  )
  const app = await electron.launch({
    args: ['.'],
    env: { ...env, TRUEFUL_USER_DATA_DIR: userDataDir }
  })
  return { app, userDataDir }
}
