import type { z } from 'zod'

// Renderer → Main（invoke）のチャネルは、このディレクトリだけで定義する（ADR-007、CLAUDE.md）。
// 引数は zod の定義で受信側が検証し、戻り値の型は型引数で決める
export type ChannelDef<Args extends z.ZodType, Result> = {
  args: Args
  // 戻り値の型を運ぶためだけの印（実行時には使わない）
  readonly result?: Result
}

export function defineChannel<Result>() {
  return <Args extends z.ZodType>(args: Args): ChannelDef<Args, Result> => ({ args })
}

// IPC は例外をそのまま運べないので、結果をこの形で返す（ADR-014 と同じく、失敗の種類を見分けられるようにする）
export type IpcErrorCode = 'forbidden-sender' | 'invalid-args' | 'internal'
export type IpcResult<T> =
  { ok: true; value: T } | { ok: false; error: { code: IpcErrorCode; message: string } }
