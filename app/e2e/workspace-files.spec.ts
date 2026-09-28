import { expect, test } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp } from './launchApp'

test('Workspace を作ると COM 側のマニフェストができ、同じ id のパーティションの残りは消える', async () => {
  // DB をバックアップから戻したときなどに残る、id 1 のパーティション
  const leftover = (dir: string): string => join(dir, 'Partitions', 'workspace-1')
  const { app, userDataDir, cleanup } = await launchApp((dir) => {
    mkdirSync(leftover(dir), { recursive: true })
    writeFileSync(join(leftover(dir), 'Cookies'), 'old')
  })
  try {
    const window = await app.firstWindow()
    const created = await window.evaluate(async () => {
      const api = (window as unknown as { trueful: Window['trueful'] }).trueful.workspace
      return api.create({ name: '案件A', mode: 'custom', requestId: crypto.randomUUID() })
    })
    expect(created).toMatchObject({ ok: true, value: { id: 1 } })

    const manifest = join(userDataDir, 'workspaces', '1', 'com.json')
    expect(JSON.parse(readFileSync(manifest, 'utf8'))).toEqual({ id: 1 })
    expect(existsSync(leftover(userDataDir))).toBe(false)

    // 消したフォルダが、Electron が persist:workspace-1 に使う場所と同じであることを確かめる
    // （このあとパーティションが作られるので、最後に行う）
    const storagePath = await app.evaluate(
      ({ session }) => session.fromPartition('persist:workspace-1').storagePath
    )
    // macOS の一時フォルダは /var → /private/var のリンクなので、どちらの書き方でもよい
    expect([leftover(userDataDir), leftover(realpathSync(userDataDir))]).toContain(storagePath)
  } finally {
    await app.close()
    cleanup()
  }
})
