import { describe, expect, it } from 'vitest'
import { isAppUrl } from './appUrl'

describe('isAppUrl', () => {
  const built = 'file:///opt/Trueful/resources/app/out/renderer/index.html'
  const dev = 'http://localhost:5173/'

  it('ビルド後は、同じ index.html だけを許す（# と ? は問わない）', () => {
    expect(isAppUrl(built, built)).toBe(true)
    expect(isAppUrl(`${built}#/settings`, built)).toBe(true)
    expect(isAppUrl('file:///etc/passwd', built)).toBe(false)
    expect(isAppUrl('https://example.com/', built)).toBe(false)
  })

  it('開発中は、開発サーバーの origin だけを許す', () => {
    expect(isAppUrl('http://localhost:5173/src/main.tsx', dev)).toBe(true)
    expect(isAppUrl('http://localhost:5174/', dev)).toBe(false)
    expect(isAppUrl('https://localhost:5173/', dev)).toBe(false)
    expect(isAppUrl('https://example.com/', dev)).toBe(false)
  })

  it('壊れた URL は許さない', () => {
    expect(isAppUrl('not a url', built)).toBe(false)
    expect(isAppUrl('', dev)).toBe(false)
  })
})
