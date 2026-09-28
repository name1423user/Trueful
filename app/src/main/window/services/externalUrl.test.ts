import { describe, expect, it } from 'vitest'
import { isExternalUrl } from './externalUrl'

describe('isExternalUrl', () => {
  it('http と https は渡す', () => {
    expect(isExternalUrl('https://example.com/')).toBe(true)
    expect(isExternalUrl('http://example.com/a?b=c')).toBe(true)
  })

  it('それ以外のスキームと壊れた URL は渡さない', () => {
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'chrome://settings',
      'mailto:a@example.com',
      'not a url',
      ''
    ]) {
      expect(isExternalUrl(url)).toBe(false)
    }
  })
})
