import { describe, expect, it } from 'vitest'
import { isAllowedPageUrl, resolveInput } from './urlInput'

const shortcuts = [
  { keyword: 'gh', urlTemplate: 'https://github.com/search?q=%s' },
  { keyword: 'npm', urlTemplate: 'https://www.npmjs.com/search?q=%s' }
]
const search = (q: string): string => `https://www.google.com/search?q=${encodeURIComponent(q)}`

describe('アドレスバーの入力の解釈', () => {
  it.each([
    ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['HTTPS://Example.com', 'https://example.com/'],
    ['http:/example.com', 'http://example.com/'],
    ['  example.com/docs  ', 'https://example.com/docs'],
    ['example.com.', 'https://example.com./'],
    ['example.com:443/path', 'https://example.com/path'],
    ['日本語.jp', 'https://xn--wgv71a119e.jp/'],
    ['sub.example.co.uk', 'https://sub.example.co.uk/']
  ])('URL は開く。スキームがなければ https: %s', (input, url) => {
    expect(resolveInput(input)).toBe(url)
  })

  it.each([
    ['localhost', 'http://localhost/'],
    ['LOCALHOST:3000', 'http://localhost:3000/'],
    ['dev.localhost:3000', 'http://dev.localhost:3000/'],
    ['my-app.test:8080', 'http://my-app.test:8080/'],
    ['printer.local', 'http://printer.local/'],
    ['127.0.0.1', 'http://127.0.0.1/'],
    ['192.168.0.10:8080/x', 'http://192.168.0.10:8080/x'],
    ['[::1]:3000', 'http://[::1]:3000/']
  ])('localhost・開発用の名前・IP は http: %s', (input, url) => {
    expect(resolveInput(input)).toBe(url)
  })

  it('localhost や IP に似た別のドメインは https', () => {
    expect(resolveInput('localhost.evil.com')).toBe('https://localhost.evil.com/')
    expect(resolveInput('192.168.1.1.nip.io')).toBe('https://192.168.1.1.nip.io/')
  })

  it('1〜65535 の数字だけなら localhost のそのポート（範囲外は検索）', () => {
    expect(resolveInput('3000')).toBe('http://localhost:3000/')
    expect(resolveInput('65535')).toBe('http://localhost:65535/')
    expect(resolveInput('0')).toBe(search('0'))
    expect(resolveInput('70000')).toBe(search('70000'))
  })

  it('近道のキーワードと語 → 近道の URL（語はエンコード。区切りは全角スペースでもよい）', () => {
    expect(resolveInput('gh electron sandbox', shortcuts)).toBe(
      'https://github.com/search?q=electron%20sandbox'
    )
    expect(resolveInput('NPM zod', shortcuts)).toBe('https://www.npmjs.com/search?q=zod')
    expect(resolveInput('gh　a+b&c#d', shortcuts)).toBe('https://github.com/search?q=a%2Bb%26c%23d')
    expect(resolveInput('gh electron')).toBe(search('gh electron'))
    const twice = [{ keyword: 'x', urlTemplate: 'https://x.example/%s?q=%s' }]
    expect(resolveInput('x a', twice)).toBe('https://x.example/a?q=a')
    const bad = [{ keyword: 'x', urlTemplate: 'javascript:%s' }]
    expect(resolveInput('x a', bad)).toBe(search('x a'))
  })

  it.each([
    'electron webcontentsview',
    'React',
    'a&b=c',
    '3.14',
    '1.2.3',
    'node.js',
    'README.md',
    'package.json',
    'user@example.com',
    'intranet',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'https://a.com/a b'
  ])('URL でないもの・http/https 以外は検索する: %s', (input) => {
    expect(resolveInput(input)).toBe(search(input))
  })

  it('「?語」は検索。空と about:blank は空のタブ', () => {
    expect(resolveInput('?example.com')).toBe(search('example.com'))
    expect(resolveInput('   ')).toBe('about:blank')
    expect(resolveInput('About:Blank')).toBe('about:blank')
  })

  it('ファイル名らしくても、パスやポートがあれば URL として開く', () => {
    expect(resolveInput('node.js/docs')).toBe('https://node.js/docs')
  })
})

describe('メインフレームで開いてよい URL', () => {
  it.each([
    'https://a.example/',
    'http://a.example/',
    'about:blank',
    'ABOUT:BLANK',
    'about:blank#x'
  ])('開いてよい: %s', (url) => expect(isAllowedPageUrl(url)).toBe(true))
  it.each([
    'file:///x',
    'javascript:1',
    'data:text/html,x',
    'blob:https://a.example/1',
    'about:srcdoc',
    'chrome://gpu',
    'view-source:https://a.example/',
    'x'
  ])('開かない: %s', (url) => expect(isAllowedPageUrl(url)).toBe(false))
})
