import { describe, expect, it } from 'vitest'
import { isAllowedPageUrl, resolveInput } from './urlInput'

const shortcuts = [
  { keyword: 'gh', urlTemplate: 'https://github.com/search?q=%s' },
  { keyword: 'npm', urlTemplate: 'https://www.npmjs.com/search?q=%s' }
]
const search = (q: string): string => `https://www.google.com/search?q=${encodeURIComponent(q)}`

describe('アドレスバーの入力の解釈', () => {
  it('URL はそのまま開く。スキームがなければ https（localhost と IP は http）', () => {
    expect(resolveInput('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(resolveInput('  example.com/docs  ')).toBe('https://example.com/docs')
    expect(resolveInput('localhost:5173')).toBe('http://localhost:5173/')
    expect(resolveInput('192.168.0.10:8080/x')).toBe('http://192.168.0.10:8080/x')
  })

  it('1〜65535 の数字だけなら localhost のそのポート（範囲外は検索）', () => {
    expect(resolveInput('3000')).toBe('http://localhost:3000/')
    expect(resolveInput('65535')).toBe('http://localhost:65535/')
    expect(resolveInput('0')).toBe(search('0'))
    expect(resolveInput('70000')).toBe(search('70000'))
  })

  it('近道のキーワードと語 → 近道の URL（語はエンコードする）', () => {
    expect(resolveInput('gh electron sandbox', shortcuts)).toBe(
      'https://github.com/search?q=electron%20sandbox'
    )
    expect(resolveInput('NPM zod', shortcuts)).toBe('https://www.npmjs.com/search?q=zod')
    expect(resolveInput('gh electron')).toBe(search('gh electron'))
  })

  it('URL でないものは既定の検索エンジンで検索する', () => {
    expect(resolveInput('electron webcontentsview')).toBe(search('electron webcontentsview'))
    expect(resolveInput('React')).toBe(search('React'))
    expect(resolveInput('a&b=c')).toBe(search('a&b=c'))
  })

  it('http・https 以外のスキームは開かず、検索語として扱う。空なら空のタブ', () => {
    expect(resolveInput('file:///etc/passwd')).toBe(search('file:///etc/passwd'))
    expect(resolveInput('javascript:alert(1)')).toBe(search('javascript:alert(1)'))
    expect(resolveInput('   ')).toBe('about:blank')
  })

  it('開いてよい URL は http・https と空のタブだけ', () => {
    expect(isAllowedPageUrl('https://a.example/')).toBe(true)
    expect(isAllowedPageUrl('about:blank')).toBe(true)
    for (const url of ['file:///x', 'javascript:1', 'data:text/html,x', 'chrome://gpu', 'x']) {
      expect(isAllowedPageUrl(url)).toBe(false)
    }
  })
})
