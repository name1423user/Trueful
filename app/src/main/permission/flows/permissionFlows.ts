import type { DatabaseSync } from 'node:sqlite'
import { getWorkspace } from '../../workspace/services/workspaceDB'
import { getDecision, setDecision, type Decision } from '../services/permissionDB'
import { originOf, requiredPermissions, type Permission } from '../services/permissionMap'

// 確認の答え。dismissed は、答えが出なかった（画面が閉じた・確認の画面がまだない）。拒否して、記憶しない
export type PermissionAnswer = Decision | 'dismissed'

type Details = {
  mediaTypes?: string[]
  isMainFrame?: boolean
  topLevelUrl?: string
  tabId?: number
}

// サイトの権限の進行役（F16）。ページの権限の要求を、記憶した答えで決める。
// 決めていなければ確認を出す（ask。画面は T3-7b）。確認の対象でない権限・http・https でないページ・
// iframe（サブフレーム）の要求は、いつも拒否する（埋め込みが、別のサイトの許可を借りない）
export class PermissionFlows {
  // 確認中のもの（同じ Workspace・サイト・権限の確認が同時に来ても、確認は1回にする）
  private readonly pending = new Map<
    string,
    { workspaceId: number; controller: AbortController; answer: Promise<PermissionAnswer> }
  >()

  constructor(
    private readonly deps: {
      getDb: () => DatabaseSync | undefined
      ask: (
        workspaceId: number,
        origin: string,
        permission: Permission,
        signal: AbortSignal,
        tabId?: number
      ) => Promise<PermissionAnswer>
      now?: () => number
    }
  ) {}

  // 許可するなら true。カメラとマイクのように複数が要るときは、全部が許可のときだけ。
  // 1つでも拒否と決めてあれば、確認せずに拒否する
  async request(
    workspaceId: number,
    url: string,
    electronPermission: string,
    details?: Details
  ): Promise<boolean> {
    const db = this.deps.getDb()
    const origin = originOf(url)
    const needed = requiredPermissions(electronPermission, details)
    if (!db?.isOpen || !origin || needed.length === 0) return false
    // メインフレームだけ。サブフレームや、今のページと違うサイトの古い要求は拒否する
    if (details?.isMainFrame === false) return false
    if (details?.topLevelUrl !== undefined && originOf(details.topLevelUrl) !== origin) return false
    for (const permission of needed) {
      const decision = getDecision(db, workspaceId, origin, permission)
      if (decision === 'deny') return false
      if (decision === 'allow') continue
      const answer = await this.confirm(workspaceId, origin, permission, details?.tabId)
      // 確認の間に、DB が閉じた・Workspace がなくなったときは、拒否して記憶しない
      if (answer === 'dismissed' || !db.isOpen || !getWorkspace(db, workspaceId)) return false
      setDecision(db, workspaceId, origin, permission, answer, this.now())
      if (answer === 'deny') return false
    }
    return true
  }

  // 同期の確認（setPermissionCheckHandler）。決めた許可だけが true（確認は出さない）。
  // media の種類が分からないときは、カメラかマイクのどちらかが許可なら true（デバイスの一覧のため）
  check(
    workspaceId: number,
    url: string,
    electronPermission: string,
    details?: { mediaTypes?: string[] }
  ): boolean {
    const db = this.deps.getDb()
    const origin = originOf(url)
    const needed = requiredPermissions(electronPermission, details)
    if (!db?.isOpen || !origin || needed.length === 0) return false
    const allowed = (p: Permission): boolean => getDecision(db, workspaceId, origin, p) === 'allow'
    const unknownMedia =
      electronPermission === 'media' && (!details?.mediaTypes || details.mediaTypes.length === 0)
    return unknownMedia ? needed.some(allowed) : needed.every(allowed)
  }

  // Workspace が閉じた・削除されたとき、確認中のものを「答えなし」にする
  dismissWorkspace(workspaceId: number): void {
    for (const entry of this.pending.values()) {
      if (entry.workspaceId === workspaceId) entry.controller.abort()
    }
  }

  private confirm(
    workspaceId: number,
    origin: string,
    permission: Permission,
    tabId?: number
  ): Promise<PermissionAnswer> {
    // タブごとに確認する（タブを閉じたら、そのタブの確認だけを終えられるように）
    const key = `${workspaceId} ${tabId ?? '-'} ${origin} ${permission}`
    const existing = this.pending.get(key)
    if (existing) return existing.answer
    const controller = new AbortController()
    const answer = this.deps
      .ask(workspaceId, origin, permission, controller.signal, tabId)
      .catch((): PermissionAnswer => 'dismissed')
      .finally(() => this.pending.delete(key))
    this.pending.set(key, { workspaceId, controller, answer })
    return answer
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }
}
