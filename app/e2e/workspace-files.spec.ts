import { expect, test } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp } from './launchApp'

test('Workspace を作ると COM 側のマニフェストができ、同じ id のパーティションの残りは消える', async () => {
  // DB をバックアップから戻したときなどに残る、id 1 のパーティション
  const leftover = (dir: string): string => join(dir, 'Partitions', 'workspace-1')
  const { app, userDataDir, cleanup } = await launchApp((dir) => {
    mkdirSync(leftover(dir), { recursive: true })
    writeFileSync(join(leftover(dir), 'leftover-marker'), 'old')
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
    // 作るとすぐにページを表示するので、Electron が同じ名前のフォルダを作り直す。残りの中身が消えたことを見る
    expect(existsSync(join(leftover(userDataDir), 'leftover-marker'))).toBe(false)

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

test('起動すると、DB にある Workspace のなくなったマニフェストを書き直す', async () => {
  const first = await launchApp()
  const manifest = join(first.userDataDir, 'workspaces', '1', 'com.json')
  try {
    const window = await first.app.firstWindow()
    await window.evaluate(async () => {
      const api = (window as unknown as { trueful: Window['trueful'] }).trueful.workspace
      return api.create({ name: '案件A', mode: 'custom', requestId: crypto.randomUUID() })
    })
    expect(existsSync(manifest)).toBe(true)
  } finally {
    await first.app.close()
  }
  // T2-1c より前に作った Workspace と同じ状態（DB に行があり、マニフェストがない）にして起動し直す
  rmSync(manifest)
  const second = await launchApp(undefined, { userDataDir: first.userDataDir })
  try {
    const window = await second.app.firstWindow()
    // DB の準備が終わるまで待つ（マニフェストは、その直後にそろえる）
    await window.evaluate(async () => {
      await (window as unknown as { trueful: Window['trueful'] }).trueful.workspace.list()
    })
    expect(JSON.parse(readFileSync(manifest, 'utf8'))).toEqual({ id: 1 })
  } finally {
    await second.app.close()
    second.cleanup()
  }
})
