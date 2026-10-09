import { describe, expect, it } from 'vitest'
import { chromeBookmarkFiles, parseChromeBookmarks } from './chromeBookmarks'
import { parseHtmlBookmarks } from './htmlBookmarks'

const chromeJson = JSON.stringify({
  roots: {
    bookmark_bar: {
      type: 'folder',
      name: 'ブックマーク バー',
      children: [
        { type: 'url', name: 'MDN', url: 'https://developer.mozilla.org/' },
        {
          type: 'folder',
          name: '開発',
          children: [{ type: 'url', name: 'GitHub', url: 'https://github.com/' }]
        },
        { type: 'url', name: '壊れた', url: 'javascript:alert(1)' }
      ]
    },
    other: { type: 'folder', name: 'その他のブックマーク', children: [] },
    synced: {
      type: 'folder',
      name: 'モバイル',
      children: [{ type: 'url', name: 'X', url: 'http://x.example/' }]
    }
  },
  version: 1
})

describe('Chrome の Bookmarks（JSON）の取り込み（F08）', () => {
  it('フォルダ構造ごと読む。空のルートは除く。http・https 以外の URL は失敗として数える', () => {
    const { nodes, failed } = parseChromeBookmarks(chromeJson)
    expect(failed).toBe(1)
    expect(nodes).toEqual([
      {
        kind: 'folder',
        title: 'ブックマーク バー',
        children: [
          { kind: 'url', title: 'MDN', url: 'https://developer.mozilla.org/' },
          {
            kind: 'folder',
            title: '開発',
            children: [{ kind: 'url', title: 'GitHub', url: 'https://github.com/' }]
          }
        ]
      },
      {
        kind: 'folder',
        title: 'モバイル',
        children: [{ kind: 'url', title: 'X', url: 'http://x.example/' }]
      }
    ])
  })

  it('JSON でないもの・roots のないものは例外（取り込めない）', () => {
    expect(() => parseChromeBookmarks('not json')).toThrow()
    expect(() => parseChromeBookmarks('{}')).toThrow()
  })

  it('url のない url ノードや、型の違うノードは失敗として数え、ほかは続ける', () => {
    const { nodes, failed } = parseChromeBookmarks(
      JSON.stringify({
        roots: {
          bookmark_bar: {
            type: 'folder',
            name: 'bar',
            children: [
              { type: 'url', name: 'no url' },
              42,
              { type: 'url', name: 'ok', url: 'https://ok.example/' }
            ]
          }
        }
      })
    )
    expect(failed).toBe(2)
    expect(nodes[0]).toMatchObject({ children: [{ title: 'ok' }] })
  })
})

describe('壊れた・極端な入力', () => {
  it('深すぎる入れ子は、溢れずに扱う（JSON は失敗として数え、HTML は例外）', () => {
    let node: unknown = { type: 'url', name: 'leaf', url: 'https://leaf.example/' }
    for (let i = 0; i < 300; i++) node = { type: 'folder', name: 'f', children: [node] }
    const { nodes, failed } = parseChromeBookmarks(
      JSON.stringify({ roots: { bookmark_bar: node } })
    )
    expect(nodes).toEqual([])
    expect(failed).toBeGreaterThan(0)
    expect(() => parseHtmlBookmarks('<DL>'.repeat(50_000))).toThrow('入れ子が深すぎる')
  })

  it('roots にフォルダ以外の値があっても、失敗に数えない。HREF のない <A>、属性値の > も扱う', () => {
    expect(
      parseChromeBookmarks(
        JSON.stringify({
          roots: {
            sync_transaction_version: '1',
            bookmark_bar: {
              type: 'folder',
              name: 'b',
              children: [{ type: 'url', name: 'a', url: 'https://a.example/' }]
            }
          }
        })
      ).failed
    ).toBe(0)
    const { nodes, failed } = parseHtmlBookmarks(
      `<DL><DT><A NAME="x">アンカー</A><DT><A HREF="https://a.example/?x>y" ICON='q'>A</A></DL></DL></DL>`
    )
    expect(failed).toBe(0)
    expect(nodes).toEqual([{ kind: 'url', title: 'A', url: 'https://a.example/?x>y' }])
  })
})

describe('Chrome のプロファイルの場所（3 OS）', () => {
  const existing =
    (paths: string[]) =>
    (p: string): boolean =>
      paths.includes(p)
  const list = (names: string[]) => (): string[] => names

  it('macOS: ~/Library/Application Support/Google/Chrome/<プロファイル>/Bookmarks。Default が先', () => {
    const base = '/Users/me/Library/Application Support/Google/Chrome'
    const files = chromeBookmarkFiles({
      platform: 'darwin',
      home: '/Users/me',
      exists: existing([`${base}/Default/Bookmarks`, `${base}/Profile 1/Bookmarks`]),
      listDir: list(['Profile 1', 'Default', 'System Profile'])
    })
    expect(files).toEqual([`${base}/Default/Bookmarks`, `${base}/Profile 1/Bookmarks`])
  })

  it('Windows: %LOCALAPPDATA%\\Google\\Chrome\\User Data\\<プロファイル>\\Bookmarks', () => {
    const files = chromeBookmarkFiles({
      platform: 'win32',
      home: 'C:\\Users\\me',
      localAppData: 'C:\\Users\\me\\AppData\\Local',
      exists: () => true,
      listDir: list(['Default'])
    })
    expect(files[0]).toBe(
      'C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Bookmarks'
    )
  })

  it('Windows: LOCALAPPDATA が空文字なら、ホームの下の AppData\\Local を使う（相対パスにしない）', () => {
    const files = chromeBookmarkFiles({
      platform: 'win32',
      home: 'C:\\Users\\me',
      localAppData: '',
      exists: () => true,
      listDir: list(['Default'])
    })
    expect(files[0]).toBe(
      'C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Bookmarks'
    )
  })

  it('Linux: ~/.config/google-chrome と ~/.config/chromium。見つからなければ空', () => {
    const files = chromeBookmarkFiles({
      platform: 'linux',
      home: '/home/me',
      exists: existing(['/home/me/.config/chromium/Default/Bookmarks']),
      listDir: list(['Default'])
    })
    expect(files).toEqual(['/home/me/.config/chromium/Default/Bookmarks'])
    expect(
      chromeBookmarkFiles({ platform: 'linux', home: '/h', exists: () => false, listDir: list([]) })
    ).toEqual([])
  })
})

const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">ブックマーク バー</H3>
  <DL><p>
    <DT><A HREF="https://developer.mozilla.org/" ADD_DATE="2">MDN &amp; Web</A>
    <DT><H3>開発</H3>
    <DL><p>
      <DT><A HREF="https://github.com/">GitHub</A>
    </DL><p>
    <DT><A HREF="javascript:alert(1)">壊れた</A>
  </DL><p>
  <DT><A HREF="http://top.example/">トップ</A>
</DL><p>`

describe('Chrome の HTML エクスポートの取り込み（F08）', () => {
  it('フォルダ構造ごと読み、&amp; などを直す。http・https 以外は失敗として数える', () => {
    const { nodes, failed } = parseHtmlBookmarks(html)
    expect(failed).toBe(1)
    expect(nodes).toEqual([
      {
        kind: 'folder',
        title: 'ブックマーク バー',
        children: [
          { kind: 'url', title: 'MDN & Web', url: 'https://developer.mozilla.org/' },
          {
            kind: 'folder',
            title: '開発',
            children: [{ kind: 'url', title: 'GitHub', url: 'https://github.com/' }]
          }
        ]
      },
      { kind: 'url', title: 'トップ', url: 'http://top.example/' }
    ])
  })

  it('ブックマークの HTML でないものは例外', () => {
    expect(() => parseHtmlBookmarks('<html><body>hello</body></html>')).toThrow()
  })

  it('閉じない <A を大量に並べた HTML でも長く固まらない', () => {
    const start = Date.now()
    parseHtmlBookmarks('<DL>' + '<A x'.repeat(300_000))
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
