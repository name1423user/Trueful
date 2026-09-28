import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  comManifestPath,
  moveToTrash,
  partitionDir,
  purgeTrash,
  readComManifest,
  writeComManifest,
  type WorkspaceRoots
} from './workspaceFiles'

let base: string
let roots: WorkspaceRoots
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'trueful-ws-'))
  roots = { userData: join(base, 'user'), sessionData: join(base, 'session') }
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('COM 側のマニフェスト（ADR-013）', () => {
  it('id を名前に含むフォルダに { id } だけを書く（フォルダがなければ作る）', () => {
    writeComManifest(roots, 7)
    const path = comManifestPath(roots, 7)
    expect(path).toBe(join(roots.userData, 'workspaces', '7', 'com.json'))
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ id: 7 })
    expect(existsSync(`${path}.tmp`)).toBe(false)
  })

  it('id が合えば ok。知らない項目があっても無視する（あとで項目を足しても古い版で読める）', () => {
    writeComManifest(roots, 3)
    expect(readComManifest(roots, 3)).toBe('ok')
    writeFileSync(comManifestPath(roots, 3), JSON.stringify({ id: 3, schemaVersion: 1, x: 'y' }))
    expect(readComManifest(roots, 3)).toBe('ok')
  })

  it('ない・JSON として読めない・id が違う・id が数でないときは broken', () => {
    expect(readComManifest(roots, 1)).toBe('broken')
    mkdirSync(join(roots.userData, 'workspaces', '1'), { recursive: true })
    for (const text of [
      '{ "id": 1',
      JSON.stringify({ id: 2 }),
      JSON.stringify({ id: '1' }),
      'null'
    ]) {
      writeFileSync(comManifestPath(roots, 1), text)
      expect(readComManifest(roots, 1)).toBe('broken')
    }
  })

  it('このアプリより新しい版が書いたものは newer（形が変わっていても書き直さないため）', () => {
    mkdirSync(join(roots.userData, 'workspaces', '1'), { recursive: true })
    writeFileSync(comManifestPath(roots, 1), JSON.stringify({ schemaVersion: 2, workspace: 1 }))
    expect(readComManifest(roots, 1)).toBe('newer')
  })

  it('書けないときは、原因の code を持つエラーにする（ADR-014）', () => {
    // workspaces をファイルにしておくと、その下にフォルダを作れない
    mkdirSync(roots.userData, { recursive: true })
    writeFileSync(join(roots.userData, 'workspaces'), '')
    expect(() => writeComManifest(roots, 1)).toThrow(
      expect.objectContaining({ name: 'WorkspaceFileError', code: expect.any(String) })
    )
  })
})

describe('パーティションのフォルダと片付け', () => {
  it('persist:workspace-<id> の保存場所は <sessionData>/Partitions/workspace-<id>', () => {
    expect(partitionDir(roots, 5)).toBe(join(roots.sessionData, 'Partitions', 'workspace-5'))
  })

  it('片付け用の場所へ中身ごと移す。なければ何もしない。ほかのフォルダには触らない', async () => {
    const trash = join(roots.sessionData, 'Partitions', '.trash')
    mkdirSync(join(partitionDir(roots, 5), 'Local Storage'), { recursive: true })
    writeFileSync(join(partitionDir(roots, 5), 'Cookies'), 'old')
    mkdirSync(partitionDir(roots, 50), { recursive: true })
    moveToTrash(partitionDir(roots, 5), trash, 123)
    expect(existsSync(partitionDir(roots, 5))).toBe(false)
    expect(readdirSync(trash)).toEqual(['workspace-5-123'])
    expect(existsSync(partitionDir(roots, 50))).toBe(true)
    expect(() => moveToTrash(partitionDir(roots, 6), trash, 124)).not.toThrow()
    await purgeTrash(trash)
    expect(existsSync(trash)).toBe(false)
    await expect(purgeTrash(trash)).resolves.toBeUndefined()
  })
})
