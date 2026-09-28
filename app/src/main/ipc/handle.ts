import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import type { z } from 'zod'
import type { ChannelDef, IpcErrorCode, IpcResult } from './channels'

type IpcMainLike = Pick<IpcMain, 'handle'>
type SenderLike = Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>

const fail = (code: IpcErrorCode, message: string): IpcResult<never> => ({
  ok: false,
  error: { code, message }
})

// 送り元が、指定した webContents（UI のウィンドウ）のメインフレームで、自分の画面の URL か。
// 同じ URL を名乗る別の webContents（M2 の Web ページ）や iframe を区別するため、3つとも確かめる
export function isFromAppMainFrame(
  event: SenderLike,
  appWebContents: Pick<WebContents, 'mainFrame'> | undefined,
  isAppUrl: (url: string) => boolean
): boolean {
  const frame = event.senderFrame
  return (
    !!frame &&
    !!appWebContents &&
    event.sender === appWebContents &&
    frame === appWebContents.mainFrame &&
    isAppUrl(frame.url)
  )
}

// invoke の受信側の共通の入口を作る。送り元の確かめ方は、ここで一度だけ決める。
// 1. 送り元が自分の UI でなければ拒否する
// 2. 引数を検証し、不正なら拒否する（ハンドラは呼ばない）
// 3. ハンドラの失敗や、IPC で運べない戻り値は、中身を漏らさずに 'internal' にする
export function createIpc(ipc: IpcMainLike, isTrustedSender: (event: SenderLike) => boolean) {
  return function handle<Name extends string, Args extends z.ZodType, Result>(
    def: ChannelDef<Name, Args, Result>,
    handler: (args: z.infer<Args>) => Result | Promise<Result>
  ): void {
    ipc.handle(def.name, async (event: IpcMainInvokeEvent, raw: unknown) => {
      if (!isTrustedSender(event)) {
        return fail('forbidden-sender', `${def.name}: 送り元が許可されていない`)
      }
      const parsed = def.args.safeParse(raw)
      if (!parsed.success) {
        // 問題の一覧は長くなりうるので、先頭の3件だけを返す
        const issues = parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.') || '(引数)'}: ${i.message}`)
        return fail('invalid-args', `${def.name}: ${issues.join(' / ')}`)
      }
      try {
        const value = await handler(parsed.data)
        // IPC は structured clone で値を運ぶ。運べない値（関数など）は、Renderer 側で例外になる前にここで止める
        structuredClone(value)
        return { ok: true, value } satisfies IpcResult<Result>
      } catch (e) {
        console.error(`[main] IPC ${def.name} に失敗`, e)
        return fail('internal', `${def.name}: Main で処理に失敗した`)
      }
    })
  }
}
