import { describe, expect, it } from 'vitest'
import { MAX_ACTIVE_WORKSPACES, workspacesToDormant } from './workspaceLimit'

// n 個のフルアクティブな Workspace。id 1 がいちばん長く使っていないもの
const active = (n: number): { id: number; lastUsedTimeMs: number }[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, lastUsedTimeMs: 1000 + i }))

describe('フルアクティブな Workspace の上限（F01・ADR-011）', () => {
  it('上限は 5 個', () => {
    expect(MAX_ACTIVE_WORKSPACES).toBe(5)
  })

  it('5 個目までは休止しない', () => {
    expect(workspacesToDormant(active(4), 5, 4)).toEqual([])
    expect(workspacesToDormant(active(5), 5, 5)).toEqual([])
  })

  it('6 個目になったら、いちばん長く使っていないものを1つ休止する', () => {
    expect(workspacesToDormant(active(6), 5, 6)).toEqual([1])
  })

  it('上限を超えている状態（7 個）なら、超えた分（2 個）を古い順に休止する', () => {
    expect(workspacesToDormant(active(7), 5, 7)).toEqual([1, 2])
  })

  it('開こうとしている Workspace（除外 ID）は、いちばん古くても選ばない', () => {
    expect(workspacesToDormant(active(6), 5, 1)).toEqual([2])
  })

  it('除外は複数も渡せる（古い順に飛ばして、次に古いものを選ぶ）', () => {
    expect(workspacesToDormant(active(6), 5, [1, 2])).toEqual([3])
  })

  it('並び順に頼らず、最後に使った時刻で選ぶ。同じ時刻なら id の小さい方', () => {
    const list = [
      { id: 9, lastUsedTimeMs: 50 },
      { id: 3, lastUsedTimeMs: 50 },
      { id: 7, lastUsedTimeMs: 10 }
    ]
    expect(workspacesToDormant(list, 1, 9)).toEqual([7, 3])
  })
})
