import type { DatabaseSync } from 'node:sqlite'
import { answers, type Answer } from '../services/answers'
import { searchBookmarks } from '../../bookmark/services/bookmarkDB'
import { searchHistory, type HistoryEntry } from '../../history/services/historyDB'
import { searchTabs, type Tab } from '../../tab/services/tabDB'
import { classifyInput, type Shortcut } from '../../tab/services/urlInput'
import { listWorkspaces, type WorkspaceMode } from '../../workspace/services/workspaceDB'

// 統合検索欄の候補（F10）。url は「開く」、search は Web 検索、workspace はその Workspace へ切り替える。
// 他の Workspace のもの（otherWorkspace）には、その Workspace の Mode を付ける（画面で Mode 色の印を出す）
export type OmniboxCandidate = {
  kind: 'answer' | 'url' | 'search' | 'tab' | 'history' | 'bookmark' | 'workspace'
  title: string
  // answer: その場の答え。title は答え（コピーする文字列）、answerKind は見出しを引くための種類、detail と color は補足
  answerKind?: Answer['kind']
  detail?: string
  color?: string
  url?: string
  tabId?: number
  workspaceId?: number
  otherWorkspace?: boolean
  mode?: WorkspaceMode
}

// 種類ごとの上限と、合わせた上限（「開く」と Web 検索は数えない）。
// 他の Workspace の候補（other）は、今の Workspace が埋まっていても枠を取っておく
const LIMIT = { tab: 3, history: 3, bookmark: 2, other: 3, total: 8 } as const
// 重複や今の Workspace のものを除いても足りるよう、多めに取ってから切る
const FETCH = 50

// 候補の並び（SPEC F10）: （その場の答え → 近道 → Truefulの操作 は T4-1b）→ 開く → 今の Workspace の
// タブ・履歴・ブックマーク → 他の Workspace の候補 → Web 検索。同じ URL は1つにまとめる（タブ > ブックマーク > 履歴、
// 今の Workspace > 他の Workspace）
export function suggest(
  db: DatabaseSync,
  input: {
    query: string
    workspaceId: number | null
    shortcuts?: Shortcut[]
    answerContext?: Parameters<typeof answers>[1]
  }
): OmniboxCandidate[] {
  const query = input.query.trim()
  // 「?」で始まる入力は Web 検索の指定。探すのは「?」のあと
  const text = query.startsWith('?') ? query.slice(1).trim() : query
  if (text === '') return []
  const { url, isSearch } = classifyInput(query, input.shortcuts)
  const modes = new Map(listWorkspaces(db).map((w) => [w.id, w] as const))
  const isCurrent = (id: number): boolean => id === input.workspaceId
  const other = (workspaceId: number): Partial<OmniboxCandidate> =>
    isCurrent(workspaceId)
      ? { workspaceId }
      : { workspaceId, otherWorkspace: true, mode: modes.get(workspaceId)?.mode }

  // 同じ URL を2度出さない。出すことにしたものだけ URL を覚える（上限で切られたものは覚えない）
  const seen = new Set<string>()
  const take = <T>(items: T[], urlOf: (item: T) => string, limit: number): T[] => {
    const kept: T[] = []
    for (const item of items) {
      if (kept.length >= limit) break
      const key = urlOf(item)
      if (seen.has(key)) continue
      seen.add(key)
      kept.push(item)
    }
    return kept
  }
  const tabCandidate = (t: Tab): OmniboxCandidate => ({
    kind: 'tab',
    title: t.title || t.url,
    url: t.url,
    tabId: t.id,
    ...other(t.workspaceId)
  })
  const historyCandidate = (h: HistoryEntry): OmniboxCandidate => ({
    kind: 'history',
    title: h.title || h.url,
    url: h.url,
    ...other(h.workspaceId)
  })

  // 今の Workspace（まとめる優先順は タブ > ブックマーク > 履歴）
  const current = input.workspaceId
  const tabs =
    current === null
      ? []
      : take(searchTabs(db, text, FETCH, { workspaceId: current }), (t) => t.url, LIMIT.tab)
  // 打った URL と同じブックマーク・履歴は「開く」にまとめる。開いているタブは同じでも残す
  // （新しく開くより、そのタブへ切り替えたいことが多い）
  const notTyped = (u: string): boolean => isSearch || u !== url
  const bookmarks = take(
    searchBookmarks(db, text, FETCH).filter((b) => notTyped(b.url ?? '')),
    (b) => b.url ?? '',
    LIMIT.bookmark
  )
  const history =
    current === null
      ? []
      : take(
          searchHistory(db, { query: text, workspaceId: current, limit: FETCH }).filter((h) =>
            notTyped(h.url)
          ),
          (h) => h.url,
          LIMIT.history
        )

  // 他の Workspace（今の Workspace が出したものは出さない）
  const lower = text.toLowerCase()
  const others: OmniboxCandidate[] = [
    ...[...modes.values()]
      .filter((w) => !isCurrent(w.id) && w.name.toLowerCase().includes(lower))
      .map((w) => ({ kind: 'workspace' as const, title: w.name, ...other(w.id) })),
    ...take(
      searchTabs(db, text, FETCH, current === null ? {} : { exceptWorkspaceId: current }),
      (t) => t.url,
      LIMIT.other
    ).map(tabCandidate),
    ...take(
      searchHistory(db, {
        query: text,
        ...(current === null ? {} : { exceptWorkspaceId: current }),
        limit: FETCH
      }).filter((h) => notTyped(h.url)),
      (h) => h.url,
      LIMIT.other
    ).map(historyCandidate)
  ].slice(0, LIMIT.other)

  const here: OmniboxCandidate[] = [
    ...tabs.map(tabCandidate),
    ...history.map(historyCandidate),
    ...bookmarks.map((b) => ({ kind: 'bookmark' as const, title: b.title || b.url!, url: b.url! }))
  ]
  return [
    ...answers(query, input.answerContext).map(
      ({ kind, value, detail, color }): OmniboxCandidate => ({
        kind: 'answer',
        title: value,
        answerKind: kind,
        ...(detail === undefined ? {} : { detail }),
        ...(color === undefined ? {} : { color })
      })
    ),
    ...(isSearch ? [] : [{ kind: 'url' as const, title: url, url }]),
    ...here.slice(0, LIMIT.total - others.length),
    ...others,
    { kind: 'search', title: text, url: isSearch ? url : classifyInput(`?${text}`).url }
  ]
}
