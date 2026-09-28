import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

// Workspace ごとのファイルの置き場所（data-schema.md「Workspace のフォルダ」）。
//   <userData>/workspaces/<id>/com.json          COM 側のマニフェスト { id }（ADR-013）
//   <userData>/workspaces/<id>/workspace.json    USER 側の json（Phase 2 で作る。名前だけ予約）
//   <sessionData>/Partitions/workspace-<id>/     パーティション persist:workspace-<id>（Electron が作る）
// フォルダ名に id を入れるのは、json が壊れていても id が分かるようにするため（ADR-012 のパターン①）
export type WorkspaceRoots = { userData: string; sessionData: string }

// COM 側のマニフェストで、このアプリが知っている一番新しい版（schemaVersion がないものは版 1）
const COM_MANIFEST_VERSION = 1

// 扱えなかったとき。ADR-014 と同じく、.code（ENOSPC・EACCES など）で種類を見分けられるようにする
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

export function workspaceDir(roots: WorkspaceRoots, id: number): string {
  return join(roots.userData, 'workspaces', String(id))
}

export function comManifestPath(roots: WorkspaceRoots, id: number): string {
  return join(workspaceDir(roots, id), 'com.json')
}

export function partitionDir(roots: WorkspaceRoots, id: number): string {
  return join(roots.sessionData, 'Partitions', `workspace-${id}`)
}

// 消す前に移しておく場所。移す元と同じフォルダの中に置く（別のドライブへの rename はできないため）
export function trashDirs(roots: WorkspaceRoots): string[] {
  return [
    join(roots.userData, 'workspaces', '.trash'),
    join(roots.sessionData, 'Partitions', '.trash')
  ]
}

// { id } を書く。一時ファイルに書いてから名前を変える（ADR-014）
export function writeComManifest(roots: WorkspaceRoots, id: number): void {
  const path = comManifestPath(roots, id)
  const tmp = `${path}.tmp`
  try {
    mkdirSync(workspaceDir(roots, id), { recursive: true })
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

// ok: id が合っている。newer: このアプリより新しい版が書いたもの（読めなくても書き直さない。
// 書き直すと、新しい版の項目が消えるため）。broken: ない・壊れている・id が合わない（書き直してよい）。
// 知らない項目は無視する（あとで項目を足しても、古い版のアプリで読める）
export function readComManifest(roots: WorkspaceRoots, id: number): 'ok' | 'newer' | 'broken' {
  let data: unknown
  try {
    data = JSON.parse(readFileSync(comManifestPath(roots, id), 'utf8'))
  } catch {
    return 'broken'
  }
  if (typeof data !== 'object' || data === null) return 'broken'
  const { id: value, schemaVersion } = data as { id?: unknown; schemaVersion?: unknown }
  if (typeof schemaVersion === 'number' && schemaVersion > COM_MANIFEST_VERSION) return 'newer'
  return value === id ? 'ok' : 'broken'
}

// フォルダを片付け用の場所へ移す（なければ何もしない）。消すのは後で purgeTrash が行う。
// 移すだけなので、中身が大きくても一瞬で終わる
export function moveToTrash(dir: string, trashDir: string, now: number): void {
  if (!existsSync(dir)) return
  try {
    mkdirSync(trashDir, { recursive: true })
    renameSync(dir, join(trashDir, `${basename(dir)}-${now}`))
  } catch (e) {
    throw new WorkspaceFileError(dir, { cause: e })
  }
}

// 片付け用の場所を中身ごと消す。失敗しても、次の起動でもう一度消す
export async function purgeTrash(trashDir: string): Promise<void> {
  await rm(trashDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
