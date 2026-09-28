import type { z } from 'zod'

// Renderer → Main（invoke）のチャネルは、このディレクトリだけで定義する（ADR-007、CLAUDE.md）。
// 名前と引数（zod の定義。受信側で検証する）を1つにまとめ、戻り値の型は型引数で決める。
// preload は zod を持ち込めない（sandbox の preload は zod を require できない）ので、
// preload が使うチャネル名は zod に依存しないファイルに分ける（T1-4-2 の channelNames.ts）
export type ChannelDef<Name extends string, Args extends z.ZodType, Result> = {
  name: Name
  args: Args
  // 戻り値の型を運ぶためだけの印（実行時には使わない）
  readonly result?: Result
}

export function defineChannel<Result>() {
  return <Name extends string, Args extends z.ZodType>(
    name: Name,
    args: Args
  ): ChannelDef<Name, Args, Result> => ({ name, args })
}

// 例外は IPC を越えられないので、成功か失敗かを判別できる形（ok で絞り込まないと value を読めない）で返す。
// message はログ用。画面に出すときは code から辞書を引く（UI の文字列は辞書経由、CLAUDE.md）
export type IpcErrorCode = 'forbidden-sender' | 'invalid-args' | 'not-found' | 'internal'

// ハンドラが、失敗の種類を Renderer に伝えたいときに投げる（それ以外の例外は internal になる）
export class IpcHandlerError extends Error {
  constructor(
    readonly code: Exclude<IpcErrorCode, 'forbidden-sender' | 'invalid-args'>,
    message: string
  ) {
    super(message)
    this.name = 'IpcHandlerError'
  }
}
export type IpcResult<T> =
  { ok: true; value: T } | { ok: false; error: { code: IpcErrorCode; message: string } }
