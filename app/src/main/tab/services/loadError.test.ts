import { describe, expect, it } from 'vitest'
import { classifyLoadError } from './loadError'

describe('読み込みの失敗の種類（F16。Chromium の net エラー番号）', () => {
  it('取りやめ（ERR_ABORTED -3。別のページへ移ったときなど、失敗ではない）は無視する', () => {
    expect(classifyLoadError(-3)).toBe('ignore')
  })

  it('インターネットがない（ERR_INTERNET_DISCONNECTED -106）は offline。ネットワークが変わった（-21）は、自動でやり直されるので load-failed', () => {
    expect(classifyLoadError(-106)).toBe('offline')
    expect(classifyLoadError(-21)).toBe('load-failed')
  })

  it('証明書のエラー（ERR_CERT_* -200〜-299。期限切れ・信頼できない発行元・名前の不一致など）は certificate', () => {
    for (const code of [-200, -201, -202, -207, -213, -299]) {
      expect(classifyLoadError(code)).toBe('certificate')
    }
    expect(classifyLoadError(-199)).not.toBe('certificate')
    expect(classifyLoadError(-300)).not.toBe('certificate')
  })

  it('それ以外（接続を拒否 -102、名前が引けない -105、タイムアウト -7 など）は load-failed', () => {
    for (const code of [-102, -105, -7, -118, -324, -501]) {
      expect(classifyLoadError(code)).toBe('load-failed')
    }
  })
})
