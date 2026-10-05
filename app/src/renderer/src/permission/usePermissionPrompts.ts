import { useEffect, useRef, useState } from 'react'

type Api = Window['trueful']['permission']
export type PermissionPrompt = Extract<
  Awaited<ReturnType<Api['prompts']>>,
  { ok: true }
>['value'][number]
export type PermissionAnswer = Parameters<Api['answer']>[1]

const api = window.trueful.permission

// 答えを待っている権限の確認（F16、T3-7b）。増えた・減ったら（permission:promptsChanged）読み直す。
// 今の Workspace の分の、いちばん古いものを1つ返す（ほかの Workspace の確認は、切り替えたら出す）
export function usePermissionPrompt(workspaceId: number | null): {
  prompt: PermissionPrompt | undefined
  answer: (id: number, answer: PermissionAnswer) => void
} {
  const [prompts, setPrompts] = useState<PermissionPrompt[]>([])
  const latest = useRef(0)

  useEffect(() => {
    let alive = true
    const reload = (): void => {
      const mine = ++latest.current
      void api.prompts().then((result) => {
        if (alive && mine === latest.current) setPrompts(result.ok ? result.value : [])
      })
    }
    reload()
    const unsubscribe = api.onPromptsChanged(reload)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return {
    prompt: prompts.find((p) => p.workspaceId === workspaceId),
    // 答えたら Main が知らせるので、一覧はそこで読み直す
    answer: (id, answer) => void api.answer(id, answer)
  }
}
