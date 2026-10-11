import { describe, expect, it } from 'vitest'
import { settingsFields } from '../../../main/settings/services/settingsSchema'
import { shortcutProblem } from './shortcut'

describe('近道の入力の検査（settings.json の検証と同じ規則）', () => {
  const existing = [{ keyword: 'gh', urlTemplate: 'https://github.com/search?q=%s' }]
  const url = 'https://example.com/?q=%s'

  it('正しければ問題なし', () => {
    expect(shortcutProblem('my-docs', url, existing)).toBeUndefined()
    expect(shortcutProblem('a1', 'http://localhost:3000/search?q=%s', existing)).toBeUndefined()
  })

  it('キーワード: 英小文字・数字・ハイフンの 1〜20 文字で、数字だけは不可、重複も不可', () => {
    expect(shortcutProblem('', url, existing)).toBe('keyword')
    expect(shortcutProblem('Docs', url, existing)).toBe('keyword')
    expect(shortcutProblem('a'.repeat(21), url, existing)).toBe('keyword')
    expect(shortcutProblem('8080', url, existing)).toBe('keywordDigits')
    expect(shortcutProblem('gh', url, existing)).toBe('keywordDuplicate')
  })

  it('URL: http・https で、%s を含む', () => {
    expect(shortcutProblem('x', 'https://example.com/', existing)).toBe('url')
    expect(shortcutProblem('x', 'javascript:alert(1)//%s', existing)).toBe('url')
    expect(shortcutProblem('x', 'file:///%s', existing)).toBe('url')
    expect(shortcutProblem('x', 'not a url %s', existing)).toBe('url')
  })
  it('50 個まで', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ keyword: `k${i}`, urlTemplate: url }))
    expect(shortcutProblem('x', url, many)).toBe('tooMany')
  })
  it('Main の検証（settings.json）と同じ判定になる', () => {
    const urls = [
      'https://example.com/?q=%s',
      'HTTPS://example.com/?q=%s',
      'https://example.com/a b?q=%s',
      'https:example.com/%s',
      'http:/example.com/%s',
      'https://exa mple.com/%s',
      'https://example.com/?q=%S',
      'ftp://example.com/%s'
    ]
    for (const keyword of ['docs', 'Docs', '8080', 'a-b', 'gh']) {
      for (const urlTemplate of urls) {
        const list = [...existing, { keyword, urlTemplate }]
        const server = settingsFields.shortcuts.safeParse(list).success
        expect(
          shortcutProblem(keyword, urlTemplate, existing) === undefined,
          `${keyword} ${urlTemplate}`
        ).toBe(server)
      }
    }
  })
})
