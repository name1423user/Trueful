import { describe, expect, it } from 'vitest'
import { availableActions, baseName, formatBytes, progressPercent } from './format'

describe('ダウンロードの表示の部品（F07）', () => {
  it('大きさを、1024 区切りで読みやすくする', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
  })

  it('進み具合は 0〜100 の整数。大きさが分からない（null・0）ときは undefined。超えても 100 まで', () => {
    expect(progressPercent(50, 200)).toBe(25)
    expect(progressPercent(0, 200)).toBe(0)
    expect(progressPercent(300, 200)).toBe(100)
    expect(progressPercent(10, null)).toBeUndefined()
    expect(progressPercent(10, 0)).toBeUndefined()
  })

  it('状態ごとに、できる操作が決まる（動いているものだけ止める・再開・取り消せる。終わったものはフォルダで表示だけ）', () => {
    expect(availableActions('in_progress')).toEqual({
      pause: true,
      resume: false,
      cancel: true,
      show: false
    })
    expect(availableActions('paused')).toEqual({
      pause: false,
      resume: true,
      cancel: true,
      show: false
    })
    expect(availableActions('completed')).toEqual({
      pause: false,
      resume: false,
      cancel: false,
      show: true
    })
    for (const state of ['cancelled', 'interrupted'] as const) {
      expect(availableActions(state)).toEqual({
        pause: false,
        resume: false,
        cancel: false,
        show: false
      })
    }
  })

  it('保存先のパスから、ファイル名だけを取り出す（/ も \\ も）', () => {
    expect(baseName('/home/me/Downloads/Trueful/A/report.pdf')).toBe('report.pdf')
    expect(baseName('C:\\Users\\me\\Downloads\\Trueful\\A\\report.pdf')).toBe('report.pdf')
    expect(baseName('noslash')).toBe('noslash')
  })
})
