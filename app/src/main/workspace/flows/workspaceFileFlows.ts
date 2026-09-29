import type { DatabaseSync } from 'node:sqlite'
import { listWorkspaces, type Workspace } from '../services/workspaceDB'
import {
  moveToTrash,
  partitionDir,
  purgeTrash,
  readComManifest,
  trashDirs,
  workspaceDir,
  writeComManifest,
  type WorkspaceRoots
} from '../services/workspaceFiles'

// 作った Workspace のファイルを用意する（createWorkspaceFlow の prepare に渡す。トランザクションの中で動く）。
// 同じ id のフォルダ（パーティションと workspaces/<id>）が残っていたら、片付け用の場所へ移して空から始める
// （DB をバックアップから戻すと番号が使い回されるため。前の Workspace のログインやファイルを引き継がない。
// data-schema.md「Workspace の削除」）。移すだけにして、消すのは後で行う（大きなフォルダでも止まらない）
export function prepareWorkspaceFiles(
  roots: WorkspaceRoots,
  now: () => number = Date.now
): (workspace: Workspace) => void {
  const [workspacesTrash, partitionsTrash] = trashDirs(roots)
  return ({ id }) => {
    moveToTrash(partitionDir(roots, id), partitionsTrash!, now())
    moveToTrash(workspaceDir(roots, id), workspacesTrash!, now())
    writeComManifest(roots, id)
  }
}

// 片付け用の場所を消す（作成の後と起動時）。失敗しても記録だけ（次の起動でもう一度消す）
export async function purgeWorkspaceTrash(roots: WorkspaceRoots): Promise<unknown[]> {
  const results = await Promise.allSettled(trashDirs(roots).map(purgeTrash))
  return results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []))
}

// 削除した Workspace のファイルを片付ける（F01。DB の行を消した後に呼ぶ）。
// 先にセッションのデータ（Cookie・ストレージ）を消し、フォルダは片付け用の場所へ移してから消す。
// どれかが失敗しても残りは続け、失敗を返す（消しきれなかった分は、次の起動の片付けで消す）
export async function cleanupDeletedWorkspaceFiles(
  roots: WorkspaceRoots,
  id: number,
  clearSession: (id: number) => Promise<void>,
  now: () => number = Date.now
): Promise<unknown[]> {
  const errors: unknown[] = []
  try {
    await clearSession(id)
  } catch (e) {
    errors.push(e)
  }
  const [workspacesTrash, partitionsTrash] = trashDirs(roots)
  for (const [dir, trash] of [
    [partitionDir(roots, id), partitionsTrash!],
    [workspaceDir(roots, id), workspacesTrash!]
  ] as const) {
    try {
      moveToTrash(dir, trash, now())
    } catch (e) {
      errors.push(e)
    }
  }
  errors.push(...(await purgeWorkspaceTrash(roots)))
  return errors
}

// 起動時に、DB にある Workspace の COM 側のマニフェストをそろえる。
// ない・壊れている・id が合わないものは書き直す（中身は { id } だけで、DB の id から作り直せる。ADR-013）。
// 新しい版のアプリが書いたものには触らない。1つが書けなくても、ほかは続ける
export function ensureComManifests(
  db: DatabaseSync,
  roots: WorkspaceRoots
): { repaired: number[]; failed: { id: number; error: unknown }[] } {
  const repaired: number[] = []
  const failed: { id: number; error: unknown }[] = []
  for (const { id } of listWorkspaces(db)) {
    if (readComManifest(roots, id) !== 'broken') continue
    try {
      writeComManifest(roots, id)
      repaired.push(id)
    } catch (error) {
      failed.push({ id, error })
    }
  }
  return { repaired, failed }
}
