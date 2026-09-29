import type { DatabaseSync } from 'node:sqlite'
import { getDecision, setDecision, type Decision } from '../services/permissionDB'
import { originOf, requiredPermissions, type Permission } from '../services/permissionMap'

// 確認の答え。dismissed は、答えが出なかった（画面が閉じた・確認の画面がまだない）。拒否して、記憶しない
export type PermissionAnswer = Decision | 'dismissed'

// サイトの権限の進行役（F16）。ページの権限の要求を、記憶した答えで決める。
// 決めていなければ確認を出す（ask。画面は T3-7b）。確認の対象でない権限・http・https でないページは、いつも拒否する
export class PermissionFlows {
  constructor(
    private readonly deps: {
      getDb: () => DatabaseSync | undefined
      ask: (
        workspaceId: number,
        origin: string,
        permission: Permission
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
    details?: { mediaTypes?: string[] }
  ): Promise<boolean> {
    const db = this.deps.getDb()
    const origin = originOf(url)
    const needed = requiredPermissions(electronPermission, details)
    if (!db?.isOpen || !origin || needed.length === 0) return false
    const decisions = needed.map((p) => getDecision(db, workspaceId, origin, p))
    if (decisions.includes('deny')) return false
    for (const [i, permission] of needed.entries()) {
      if (decisions[i] === 'allow') continue
      const answer = await this.deps.ask(workspaceId, origin, permission)
      if (answer === 'dismissed') return false
      if (db.isOpen) setDecision(db, workspaceId, origin, permission, answer, this.now())
      if (answer === 'deny') return false
    }
    return true
  }

  // 同期の確認（setPermissionCheckHandler）。決めた許可だけが true（確認は出さない）
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
    return needed.every((p) => getDecision(db, workspaceId, origin, p) === 'allow')
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }
}
