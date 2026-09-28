import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineChannel, IpcHandlerError } from './channels'
import { createIpc, isFromAppMainFrame } from './handle'

const APP_URL = 'file:///app/out/renderer/index.html'
const isAppUrl = (url: string): boolean => url === APP_URL

// 偽の webContents とフレーム
const mainFrame = { url: APP_URL }
const appWebContents = { mainFrame }
const fromApp = { sender: appWebContents, senderFrame: mainFrame }

const echo = defineChannel<{ text: string }>()(
  'test:echo',
  z.object({ text: z.string().max(10) }).strict()
)

type Handler = (args: { text: string }) => unknown
type Invoke = (raw: unknown, event?: unknown) => Promise<unknown>

// ipcMain.handle に登録された関数を取り出し、偽の event で呼ぶ
function register(handler: Handler = vi.fn((args: { text: string }) => args)): {
  invoke: Invoke
  handler: Handler
} {
  let registered: ((event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown>) | undefined
  const ipc = {
    handle: (_name: string, fn: typeof registered) => {
      registered = fn
    }
  }
  const handle = createIpc(ipc as never, (e) =>
    isFromAppMainFrame(e, appWebContents as never, isAppUrl)
  )
  handle(echo, handler)
  const invoke: Invoke = (raw, event = fromApp) => registered!(event as never, raw)
  return { invoke, handler }
}

describe('createIpc の handle', () => {
  it('自分の UI からの正しい引数は、ハンドラを呼んで { ok: true, value } を返す', async () => {
    const { invoke } = register()
    expect(await invoke({ text: 'hi' })).toEqual({ ok: true, value: { text: 'hi' } })
  })

  it('不正な引数は invalid-args で拒否し、ハンドラを呼ばない', async () => {
    const { invoke, handler } = register()
    const bad = [undefined, 'hi', { text: 1 }, { text: 'x'.repeat(11) }, { text: 'hi', extra: 1 }]
    for (const raw of bad) {
      expect(await invoke(raw)).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('自分の UI 以外からは forbidden-sender で拒否する（別の URL・別の webContents・iframe・消えたフレーム）', async () => {
    const { invoke, handler } = register()
    const otherFrameSameUrl = { url: APP_URL }
    const events = [
      { sender: appWebContents, senderFrame: { url: 'https://evil.example/' } },
      // 同じ URL を名乗る別の webContents（M2 の Web ページ）
      { sender: { mainFrame: otherFrameSameUrl }, senderFrame: otherFrameSameUrl },
      // UI の中の iframe（メインフレームではない）
      { sender: appWebContents, senderFrame: otherFrameSameUrl },
      { sender: appWebContents, senderFrame: null }
    ]
    for (const event of events) {
      expect(await invoke({ text: 'hi' }, event)).toMatchObject({
        ok: false,
        error: { code: 'forbidden-sender' }
      })
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('ハンドラの失敗は internal にし、元のエラーの中身を Renderer に渡さない', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { invoke } = register(() => {
      throw new Error('secret path /home/user/.config')
    })
    const result = await invoke({ text: 'hi' })
    expect(result).toMatchObject({ ok: false, error: { code: 'internal' } })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('ハンドラが IpcHandlerError を投げたら、その種類（not-found など）で返す', async () => {
    const { invoke } = register(() => {
      throw new IpcHandlerError('not-found', 'ない')
    })
    expect(await invoke({ text: 'hi' })).toMatchObject({ ok: false, error: { code: 'not-found' } })
  })

  it('IPC で運べない戻り値（関数など）は、例外ではなく internal で返す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { invoke } = register(() => ({ fn: () => 1 }))
    expect(await invoke({ text: 'hi' })).toMatchObject({ ok: false, error: { code: 'internal' } })
  })
})
