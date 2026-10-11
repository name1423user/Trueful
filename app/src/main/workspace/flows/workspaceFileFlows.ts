import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import {
  lastWorkspaceId,
  listWorkspaces,
  skipWorkspaceId,
  type Workspace
} from '../services/workspaceDB'
import { deletedWorkspaceIds } from '../services/workspaceSnapshot'
import {
  moveToTrash,
  partitionDir,
  purgeTrash,
  readComManifest,
  trashDirs,
  workspaceDir,
  WorkspaceFileError,
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

const MOVE_ATTEMPTS = 4
const MOVE_RETRY_MS = 250

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
    // Windows では、セッションがまだフォルダを掴んでいて移せない（EBUSY・EPERM）ことがある。少し待って数回やり直す
    for (let attempt = 1; ; attempt++) {
      try {
        moveToTrash(dir, trash, now())
        break
      } catch (e) {
        const code = (e as WorkspaceFileError).code
        if (attempt >= MOVE_ATTEMPTS || (code !== 'EBUSY' && code !== 'EPERM')) {
          errors.push(e)
          break
        }
        await new Promise((resolve) => setTimeout(resolve, MOVE_RETRY_MS))
      }
    }
  }
  errors.push(...(await purgeWorkspaceTrash(roots)))
  return errors
}

// 起動時に、DB にある Workspace の COM 側のマニフェストをそろえる。
// ない・壊れている・id が合わないものは書き直す（中身は { id } だけで、DB の id から作り直せる。ADR-013）。
// 新しい版のアプリが書いたものには触らない。1つが書けなくても、ほかは続ける。
// missing は、Workspace のフォルダもパーティションもなかったもの（手で消した・移した。ADR-012 のパターン③。
// ログインとサイトのデータは戻せない）。フォルダだけ消えたものは、ログインが残っているので書き直すだけ（パターン①）
export function ensureComManifests(
  db: DatabaseSync,
  roots: WorkspaceRoots
): { repaired: number[]; missing: number[]; failed: { id: number; error: unknown }[] } {
  const repaired: number[] = []
  const missing: number[] = []
  const failed: { id: number; error: unknown }[] = []
  for (const { id } of listWorkspaces(db)) {
    if (readComManifest(roots, id) !== 'broken') continue
    if (!existsSync(workspaceDir(roots, id)) && !existsSync(partitionDir(roots, id)))
      missing.push(id)
    try {
      writeComManifest(roots, id)
      repaired.push(id)
    } catch (error) {
      failed.push({ id, error })
    }
  }
  return { repaired, missing, failed }
}

// 起動のときに知らせること（ADR-012 の3パターン。F12）。① マニフェストを書き直した、② 作成が途中で終わっていた、
// ③ Workspace のフォルダもパーティションもなかった
export type WorkspaceFileNotice =
  | { kind: 'manifestRepaired'; names: string[] }
  | { kind: 'unfinishedCreate' }
  | { kind: 'filesMissing'; workspaceId: number; name: string }

// 起動時に Workspace のファイルを確かめてそろえ、知らせることを返す。
// DB をバックアップから戻した起動（recovered）では、一覧にない Workspace のフォルダには触らず（手で直せるように
// 残す）、その番号を使い終わったことにする（次の起動で「作りかけ」と見なさず、新しい Workspace にも使わない）。
// 知らせは DB を戻したことの知らせだけにする
export function collectWorkspaceNotices(
  db: DatabaseSync,
  roots: WorkspaceRoots,
  recovered: boolean,
  now: () => number = Date.now
): WorkspaceFileNotice[] {
  if (recovered) for (const id of orphanIds(db, roots)) skipWorkspaceId(db, id)
  const unfinished = recovered ? [] : sweepUnfinishedWorkspaces(db, roots, now)
  const { repaired, missing, failed } = ensureComManifests(db, roots)
  if (repaired.length > 0) console.warn('[workspace] マニフェストを書き直した', repaired)
  if (failed.length > 0) console.error('[workspace] マニフェストを書けなかった', failed)
  if (recovered) return []
  const names = new Map(listWorkspaces(db).map((w) => [w.id, w.name]))
  const name = (id: number): string => names.get(id) ?? String(id)
  const fixed = repaired.filter((id) => !missing.includes(id))
  return [
    ...(fixed.length > 0 ? [{ kind: 'manifestRepaired' as const, names: fixed.map(name) }] : []),
    ...(unfinished.length > 0 ? [{ kind: 'unfinishedCreate' as const }] : []),
    ...missing
      .filter((id) => !failed.some((f) => f.id === id))
      .map((id) => ({ kind: 'filesMissing' as const, workspaceId: id, name: name(id) }))
  ]
}

// workspaces/ の下にある、DB にない番号のフォルダ
function orphanIds(db: DatabaseSync, roots: WorkspaceRoots): number[] {
  let names: string[]
  try {
    names = readdirSync(join(roots.userData, 'workspaces'))
  } catch {
    return []
  }
  const known = new Set(listWorkspaces(db).map((w) => w.id))
  return names.filter((n) => /^[1-9]\d*$/.test(n) && !known.has(Number(n))).map(Number)
}

// DB にない番号の Workspace のフォルダを、パーティションといっしょに片付け用の場所へ移す。
// - 確定したことのない番号（AUTOINCREMENT の記録より大きい）: 作成のトランザクションの中でファイルを書いた後、
//   確定する前に終わった（ADR-012 のパターン②）。移して、その番号を返す（知らせる）
// - 削除した Workspace（スナップショットがある）: 削除の後の片付けが終わらなかった。黙って移す
// - それ以外（DB をバックアップから戻して一覧から消えた、作成に失敗した）: 触らない
export function sweepUnfinishedWorkspaces(
  db: DatabaseSync,
  roots: WorkspaceRoots,
  now: () => number = Date.now
): number[] {
  const last = lastWorkspaceId(db)
  const deleted = deletedWorkspaceIds(db)
  const [workspacesTrash, partitionsTrash] = trashDirs(roots)
  const swept: number[] = []
  for (const id of orphanIds(db, roots)) {
    if (id <= last && !deleted.has(id)) continue
    try {
      moveToTrash(partitionDir(roots, id), partitionsTrash!, now())
      moveToTrash(workspaceDir(roots, id), workspacesTrash!, now())
      if (id > last) swept.push(id)
    } catch (e) {
      // 移せなくても、ほかは続ける（次の起動でもう一度片付ける）
      console.error('[workspace] 残ったフォルダを片付けられなかった', id, e)
    }
  }
  return swept
}
