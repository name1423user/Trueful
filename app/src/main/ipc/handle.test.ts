import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineChannel } from './channels'
import { handle } from './handle'

const APP_URL = 'file:///app/out/renderer/index.html'
const echo = defineChannel<{ text: string }>()(z.object({ text: z.string().max(10) }).strict())

// ipcMain.handle に登録された関数を取り出し、偽の event で呼ぶ
type EchoHandler = (args: { text: string }) => unknown

function register(handler: EchoHandler = vi.fn((args: { text: string }) => args)): {
  invoke: (raw: unknown, url?: string | null) => Promise<unknown>
  handler: EchoHandler
} {
  let registered: ((event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown>) | undefined
  const ipc = {
    handle: (_channel: string, fn: typeof registered) => {
      registered = fn
    }
  }
  handle(ipc as never, 'test:echo', echo, (url) => url === APP_URL, handler)
  const invoke = (raw: unknown, url: string | null = APP_URL): Promise<unknown> =>
    registered!({ senderFrame: url === null ? null : { url } } as never, raw)
  return { invoke, handler }
}

describe('handle', () => {
  it('自分の UI からの正しい引数は、ハンドラを呼んで { ok: true, value } を返す', async () => {
    const { invoke } = register()
    expect(await invoke({ text: 'hi' })).toEqual({ ok: true, value: { text: 'hi' } })
  })

  it('不正な引数は invalid-args で拒否し、ハンドラを呼ばない', async () => {
    const { invoke, handler } = register()
    for (const raw of [
      undefined,
      'hi',
      { text: 1 },
      { text: 'x'.repeat(11) },
      { text: 'hi', extra: 1 }
    ]) {
      expect(await invoke(raw)).toMatchObject({ ok: false, error: { code: 'invalid-args' } })
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('自分の UI 以外（別のページ・iframe・消えたフレーム）からは forbidden-sender で拒否する', async () => {
    const { invoke, handler } = register()
    for (const url of ['https://evil.example/', 'file:///etc/passwd', '', null]) {
      expect(await invoke({ text: 'hi' }, url)).toMatchObject({
        ok: false,
        error: { code: 'forbidden-sender' }
      })
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('ハンドラの失敗は internal にし、元のエラーの中身を Renderer に渡さない', async () => {
    const { invoke } = register(
      vi.fn(() => {
        throw new Error('secret path /home/user/.config')
      })
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await invoke({ text: 'hi' })
    expect(result).toMatchObject({ ok: false, error: { code: 'internal' } })
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})
