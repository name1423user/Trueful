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

// Workspace の一覧と、作成・切替（Main の workspace:* を呼ぶ）
export function useWorkspaces(): {
  state: WorkspacesState
  create: (
    name: string,
    mode: WorkspaceMode,
    requestId: string
  ) => Promise<{ ok: true; id: number } | { ok: false; code: IpcErrorCode }>
  switchTo: (id: number) => Promise<IpcErrorCode | undefined>
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
      if (names.length > 0) setNotice(names)
    }
    setState(toState(result))
  }, [])

  const reload = useCallback(async () => apply(await api.list()), [apply])

  // 最初の読み込み。画面が消えた後に返事が来たら捨てる
  useEffect(() => {
    let active = true
    void api.list().then((result) => {
      if (active) apply(result)
    })
    return () => {
      active = false
    }
  }, [apply])

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

  const dismissNotice = useCallback(() => setNotice([]), [])

  return { state, create, switchTo, notice, dismissNotice }
}
