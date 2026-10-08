import { useEffect, useState } from 'react'

export type Candidate = Extract<
  Awaited<ReturnType<Window['trueful']['omnibox']['suggest']>>,
  { ok: true }
>['value'][number]

// 打った文字列への統合検索欄の候補（F10）。query が null か空なら、候補なし。
// 新しい返事が届くまでは前の候補を出し続ける（消すと、一覧が作り直されて、ページの位置が跳ねる）。
// 続けて打ったとき、遅れて届いた古い返事は捨てる
export function useSuggestions(query: string | null, workspaceId: number | null): Candidate[] {
  const [list, setList] = useState<Candidate[]>([])
  const text = query?.trim() ?? ''
  useEffect(() => {
    if (text === '') return
    let alive = true
    window.trueful.omnibox.suggest(text, workspaceId).then(
      (r) => alive && setList(r.ok ? r.value : []),
      () => alive && setList([])
    )
    return () => {
      alive = false
    }
  }, [text, workspaceId])
  return text === '' ? [] : list
}
