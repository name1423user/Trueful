import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { ChannelDef, IpcErrorCode, IpcResult } from './channels'

type IpcMainLike = Pick<IpcMain, 'handle'>

const fail = (code: IpcErrorCode, message: string): IpcResult<never> => ({
  ok: false,
  error: { code, message }
})

// invoke の受信側の共通の入口。
// 1. 送り元が自分の UI でなければ拒否する（ページの中の iframe なども含む）
// 2. 引数を検証し、不正なら拒否する（ハンドラは呼ばない）
// 3. ハンドラの失敗は、中身を Renderer に漏らさずに 'internal' として返す
export function handle<Args extends z.ZodType, Result>(
  ipc: IpcMainLike,
  channel: string,
  def: ChannelDef<Args, Result>,
  isTrustedSender: (url: string) => boolean,
  handler: (args: z.infer<Args>) => Result | Promise<Result>
): void {
  ipc.handle(channel, async (event: IpcMainInvokeEvent, raw: unknown) => {
    const url = event.senderFrame?.url
    if (!url || !isTrustedSender(url)) {
      return fail('forbidden-sender', `${channel}: 送り元が許可されていない`)
    }
    const parsed = def.args.safeParse(raw)
    if (!parsed.success) {
      return fail('invalid-args', `${channel}: ${z.prettifyError(parsed.error)}`)
    }
    try {
      const value = await handler(parsed.data)
      return { ok: true, value } satisfies IpcResult<Result>
    } catch (e) {
      console.error(`[main] IPC ${channel} に失敗`, e)
      return fail('internal', `${channel}: Main で処理に失敗した`)
    }
  })
}
