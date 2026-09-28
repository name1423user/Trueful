import type { DatabaseSync } from 'node:sqlite'
import { listWorkspaces, type Workspace } from '../services/workspaceDB'
import { readComManifestId, removePartitionDir, writeComManifest } from '../services/workspaceFiles'

// 作った Workspace のファイルを用意する（createWorkspaceFlow の prepare に渡す）。
// 同じ id のパーティションのフォルダが残っていたら先に消す（DB をバックアップから戻すと番号が使い回されるため。
// data-schema.md「Workspace の削除」）。そのあとで COM 側のマニフェストを書く
export function prepareWorkspaceFiles(root: string): (workspace: Workspace) => void {
  return ({ id }) => {
    removePartitionDir(root, id)
    writeComManifest(root, id)
  }
}

// 起動時に、DB にある Workspace の COM 側のマニフェストをそろえる。
// ない・壊れている・id が合わないものは書き直す（中身は { id } だけで、DB の id から作り直せる。ADR-013）。
// 書き直した id を返す（記録用）。1つが書けなくても、ほかは続ける
export function ensureComManifests(
  db: DatabaseSync,
  root: string
): { repaired: number[]; failed: { id: number; error: unknown }[] } {
  const repaired: number[] = []
  const failed: { id: number; error: unknown }[] = []
  for (const { id } of listWorkspaces(db)) {
    if (readComManifestId(root, id) === id) continue
    try {
      writeComManifest(root, id)
      repaired.push(id)
    } catch (error) {
      failed.push({ id, error })
    }
  }
  return { repaired, failed }
}
