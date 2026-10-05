import { useCallback, useEffect, useRef, useState } from 'react'
import { newlyDormant } from './dormant'

type Api = Window['trueful']['workspace']
type ListValue = Extract<Awaited<ReturnType<Api['list']>>, { ok: true }>['value']
export type Workspace = ListValue['workspaces'][number]
export type WorkspaceMode = Workspace['mode']
export type IpcErrorCode = Extract<Awaited<ReturnType<Api['list']>>, { ok: false }>['error']['code']

export type WorkspacesState =
  | { status: 'loading' }
  | { status: 'error'; code: IpcErrorCode }
  | { status: 'ready'; workspaces: Workspace[]; currentId: number | null }

// preload が公開した API（起動時には用意されている）
const api = window.trueful.workspace

function toState(result: Awaited<ReturnType<Api['list']>>): WorkspacesState {
  return result.ok
    ? { status: 'ready', ...result.value }
    : { status: 'error', code: result.error.code }
}

// Workspace の一覧と、作成・切替・削除（Main の workspace:* を呼ぶ）
export function useWorkspaces(): {
  state: WorkspacesState
  create: (
    name: string,
    mode: WorkspaceMode,
    requestId: string
  ) => Promise<{ ok: true; id: number } | { ok: false; code: IpcErrorCode }>
  switchTo: (id: number) => Promise<IpcErrorCode | undefined>
  remove: (
    id: number
  ) => Promise<{ ok: true; currentId: number | null } | { ok: false; code: IpcErrorCode }>
  // 自動で休止した Workspace の名前（事後の知らせ。ADR-011）
  notice: string[]
  dismissNotice: () => void
} {
  const [state, setState] = useState<WorkspacesState>({ status: 'loading' })
  const [notice, setNotice] = useState<string[]>([])
  // 読み直しのとき、前の一覧と比べて、新しく休止したものを知らせる
  const known = useRef<Workspace[]>([])

  const apply = useCallback((result: Awaited<ReturnType<Api['list']>>) => {
    if (result.ok) {
      const names = newlyDormant(known.current, result.value.workspaces).map((w) => w.name)
      known.current = result.value.workspaces
      // 閉じる前に次の休止があったら、名前を足す（前の分を消さない）
      if (names.length > 0) setNotice((prev) => [...new Set([...prev, ...names])])
    }
    setState(toState(result))
  }, [])

  // 一覧の読み込み。続けて呼んだら、最後の呼び出しの返事だけを使う（古い返事で一覧と known を戻さない）。
  // 画面が消えた後に返事が来たら捨てる
  const latest = useRef(0)
  const reload = useCallback(async () => {
    const mine = ++latest.current
    const result = await api.list()
    if (mine === latest.current) apply(result)
  }, [apply])

  // 最初の読み込み。画面が消えたら、返事を捨てる
  useEffect(() => {
    void reload()
    return () => {
      latest.current = -1
    }
  }, [reload])

  // requestId は作成画面が1回の作成ごとに1つ用意する。同じ requestId の依頼は Main が1回だけ処理する
  const create = useCallback(
    async (name: string, mode: WorkspaceMode, requestId: string) => {
      const result = await api.create({ name, mode, requestId })
      if (!result.ok) return { ok: false as const, code: result.error.code }
      await reload()
      return { ok: true as const, id: result.value.id }
    },
    [reload]
  )

  // 切り替えは、Main の返事を待ってから一覧を読み直さずに、今の Workspace だけを変える（300ms 以内）
  // 見つからなかったときは、一覧が古いので読み直す
  const switchTo = useCallback(
    async (id: number) => {
      const result = await api.switch(id)
      if (!result.ok) {
        if (result.error.code === 'not-found') await reload()
        return result.error.code
      }
      setState((s) => (s.status === 'ready' ? { ...s, currentId: id } : s))
      // 休止・復帰の結果は、画面を切り替えた後に読み直して知る
      void reload()
      return undefined
    },
    [reload]
  )

  // 削除（F01）。成功したら一覧を読み直す（今の Workspace を消したら、Main が残りの1つへ移している）。
  // 見つからなかったときも、一覧が古いので読み直す
  const remove = useCallback(
    async (id: number) => {
      const result = await api.delete(id)
      if (result.ok || result.error.code === 'not-found') await reload()
      return result.ok
        ? { ok: true as const, currentId: result.value.currentId }
        : { ok: false as const, code: result.error.code }
    },
    [reload]
  )

  const dismissNotice = useCallback(() => setNotice([]), [])

  return { state, create, switchTo, remove, notice, dismissNotice }
}
