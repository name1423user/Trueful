import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Workspace ごとのファイルの置き場所（data-schema.md「Workspace のフォルダ」）。
//   userData/workspaces/<id>/com.json        COM 側のマニフェスト { id }（ADR-013）
//   userData/workspaces/<id>/workspace.json  USER 側の json（Phase 2 で作る。名前だけ予約）
//   userData/Partitions/workspace-<id>/      パーティション persist:workspace-<id>（Electron が作る）
// フォルダ名に id を入れるのは、json が壊れていても id が分かるようにするため（ADR-012 のパターン①）

// 書けなかったとき。ADR-014 と同じく、.code（ENOSPC・EACCES など）で種類を見分けられるようにする
export class WorkspaceFileError extends Error {
  readonly code: string | undefined
  constructor(
    readonly path: string,
    options: { cause: unknown }
  ) {
    super(`Workspace のファイルを扱えなかった: ${path}`, options)
    this.name = 'WorkspaceFileError'
    this.code = (options.cause as NodeJS.ErrnoException | undefined)?.code
  }
}

export function workspaceDir(root: string, id: number): string {
  return join(root, 'workspaces', String(id))
}

export function comManifestPath(root: string, id: number): string {
  return join(workspaceDir(root, id), 'com.json')
}

export function partitionDir(root: string, id: number): string {
  return join(root, 'Partitions', `workspace-${id}`)
}

// { id } を書く。一時ファイルに書いてから名前を変える（ADR-014）
export function writeComManifest(root: string, id: number): void {
  const path = comManifestPath(root, id)
  const tmp = `${path}.tmp`
  try {
    mkdirSync(workspaceDir(root, id), { recursive: true })
    writeFileSync(tmp, `${JSON.stringify({ id })}\n`)
    renameSync(tmp, path)
  } catch (e) {
    // 片付けの失敗（フォルダがない等）で、元の原因を隠さない
    try {
      rmSync(tmp, { force: true })
    } catch {
      /* 残っても次の書き込みで上書きされる */
    }
    throw new WorkspaceFileError(path, { cause: e })
  }
}

// フォルダの id と中身の id が合っていれば、その id を返す。ない・壊れている・合わないときは undefined。
// 知らない項目は無視する（あとで項目を足しても、古い版のアプリで読める）
export function readComManifestId(root: string, id: number): number | undefined {
  try {
    const data: unknown = JSON.parse(readFileSync(comManifestPath(root, id), 'utf8'))
    const value = (data as { id?: unknown } | null)?.id
    return value === id ? id : undefined
  } catch {
    return undefined
  }
}

// パーティションのフォルダを中身ごと消す（なければ何もしない）
export function removePartitionDir(root: string, id: number): void {
  const dir = partitionDir(root, id)
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (e) {
    throw new WorkspaceFileError(dir, { cause: e })
  }
}
