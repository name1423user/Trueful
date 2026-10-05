import type { Permission } from '../services/permissionMap'
import type { PermissionAnswer } from './permissionFlows'

// 画面に出す確認（F16）。id は Main が付ける（答えの宛先）
export type PermissionPrompt = {
  id: number
  workspaceId: number
  origin: string
  permission: Permission
}

// 権限の確認の待ち行列（T3-7b）。PermissionFlows の ask として使う。
// 確認を並べて画面に知らせ（notify）、画面の答え（permission:answer）で終える。
// 止められたら（Workspace の削除など）、答えなしで終える
export class PermissionPrompts {
  private nextId = 1
  private readonly waiting = new Map<
    number,
    { prompt: PermissionPrompt; resolve: (answer: PermissionAnswer) => void }
  >()

  constructor(private readonly notify: () => void) {}

  ask(
    workspaceId: number,
    origin: string,
    permission: Permission,
    signal: AbortSignal
  ): Promise<PermissionAnswer> {
    if (signal.aborted) return Promise.resolve('dismissed')
    const prompt = { id: this.nextId++, workspaceId, origin, permission }
    return new Promise((resolve) => {
      this.waiting.set(prompt.id, { prompt, resolve })
      signal.addEventListener('abort', () => this.answer(prompt.id, 'dismissed'), { once: true })
      this.notify()
    })
  }

  // 古い順
  list(): PermissionPrompt[] {
    return [...this.waiting.values()].map((w) => w.prompt)
  }

  // ない id・答え終わった id なら false
  answer(id: number, answer: PermissionAnswer): boolean {
    const entry = this.waiting.get(id)
    if (!entry) return false
    this.waiting.delete(id)
    entry.resolve(answer)
    this.notify()
    return true
  }

  dismissAll(): void {
    for (const id of [...this.waiting.keys()]) this.answer(id, 'dismissed')
  }
}
