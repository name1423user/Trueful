import { describe, expect, it } from 'vitest'
import { initial } from './initial'

describe('Workspace の頭文字', () => {
  it('最初の1文字。英字は大文字、日本語や絵文字もそのまま1文字', () => {
    expect(initial('beta')).toBe('B')
    expect(initial('案件A')).toBe('案')
    expect(initial('𠮷野家')).toBe('𠮷')
    expect(initial('')).toBe('')
  })
})
