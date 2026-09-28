import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  comManifestPath,
  partitionDir,
  readComManifestId,
  removePartitionDir,
  writeComManifest
} from './workspaceFiles'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'trueful-ws-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('COM 側のマニフェスト（ADR-013）', () => {
  it('id を名前に含むフォルダに { id } だけを書く（フォルダがなければ作る）', () => {
    writeComManifest(root, 7)
    const path = comManifestPath(root, 7)
    expect(path).toBe(join(root, 'workspaces', '7', 'com.json'))
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ id: 7 })
    expect(existsSync(`${path}.tmp`)).toBe(false)
  })

  it('読むと id を返す。知らない項目があっても無視する（あとで項目を足しても古い版で読める）', () => {
    writeComManifest(root, 3)
    expect(readComManifestId(root, 3)).toBe(3)
    writeFileSync(comManifestPath(root, 3), JSON.stringify({ id: 3, schemaVersion: 2, x: 'y' }))
    expect(readComManifestId(root, 3)).toBe(3)
  })

  it('ない・JSON として読めない・id が違う・id が数でないときは undefined', () => {
    expect(readComManifestId(root, 1)).toBeUndefined()
    mkdirSync(join(root, 'workspaces', '1'), { recursive: true })
    writeFileSync(comManifestPath(root, 1), '{ "id": 1')
    expect(readComManifestId(root, 1)).toBeUndefined()
    writeFileSync(comManifestPath(root, 1), JSON.stringify({ id: 2 }))
    expect(readComManifestId(root, 1)).toBeUndefined()
    writeFileSync(comManifestPath(root, 1), JSON.stringify({ id: '1' }))
    expect(readComManifestId(root, 1)).toBeUndefined()
    writeFileSync(comManifestPath(root, 1), 'null')
    expect(readComManifestId(root, 1)).toBeUndefined()
  })

  it('書けないときは、原因の code を持つエラーにする（ADR-014）', () => {
    // workspaces をファイルにしておくと、その下にフォルダを作れない
    writeFileSync(join(root, 'workspaces'), '')
    expect(() => writeComManifest(root, 1)).toThrow(
      expect.objectContaining({ name: 'WorkspaceFileError', code: expect.any(String) })
    )
  })
})

describe('パーティションのフォルダ', () => {
  it('persist:workspace-<id> の保存場所は userData/Partitions/workspace-<id>', () => {
    expect(partitionDir(root, 5)).toBe(join(root, 'Partitions', 'workspace-5'))
  })

  it('残っていたら中身ごと消す。なければ何もしない。ほかの id のフォルダには触らない', () => {
    mkdirSync(join(partitionDir(root, 5), 'Local Storage'), { recursive: true })
    writeFileSync(join(partitionDir(root, 5), 'Cookies'), 'old')
    mkdirSync(partitionDir(root, 50), { recursive: true })
    removePartitionDir(root, 5)
    expect(existsSync(partitionDir(root, 5))).toBe(false)
    expect(existsSync(partitionDir(root, 50))).toBe(true)
    expect(() => removePartitionDir(root, 6)).not.toThrow()
  })
})
