// アドレスバーに打った文字列を、開く URL に変える（F02、F10 の近道）。
// 開けるのは http・https と空のタブだけ（file:・javascript: などは開かない）
export type Shortcut = { keyword: string; urlTemplate: string }

// 既定の検索エンジン（設定で変えられるようにするのは F14 の項目を足すとき）
export const DEFAULT_SEARCH_TEMPLATE = 'https://www.google.com/search?q=%s'

// 開発でよく打つファイル名の拡張子。「README.md」「node.js」などは、パスもポートもなければ検索する
// （.md・.py・.sh・.rs などは実在の国別ドメインでもあるが、打つ人の多くは検索のつもりなので）
const FILE_EXTENSIONS = new Set(
  'js mjs cjs ts tsx jsx json md mdx py rb rs go sh txt log lock yml yaml toml css scss html vue'.split(
    ' '
  )
)
// 開発用の名前（https の証明書がないことが多いので http で開く）
const DEV_SUFFIXES = ['.localhost', '.local', '.test', '.internal']

// メインフレームで開いてよい URL か（アドレスバー、ページのリンクやリダイレクトの行き先を、これで確かめる）。
// サブフレーム（iframe の about:srcdoc・blob: など）には使わない
export function isAllowedPageUrl(url: string): boolean {
  try {
    const { protocol, pathname } = new URL(url)
    return (
      protocol === 'http:' ||
      protocol === 'https:' ||
      (protocol === 'about:' && pathname.toLowerCase() === 'blank')
    )
  } catch {
    return false
  }
}

function search(query: string): string {
  return DEFAULT_SEARCH_TEMPLATE.replaceAll('%s', encodeURIComponent(query))
}

// スキームのない入力を、ホスト名として開けるなら URL にする。開けなければ undefined
function asHost(text: string): string | undefined {
  let url: URL
  try {
    url = new URL(`http://${text}`)
  } catch {
    return undefined
  }
  if (url.username || url.password) return undefined // user@example.com はメールアドレスとして検索
  const host = url.hostname.replace(/\.$/, '')
  const hasMore = url.port !== '' || /[/?#]/.test(text)
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(:\d+)?([/?#]|$)/.exec(text)
  const local =
    host === 'localhost' ||
    host.startsWith('[') ||
    (ipv4 !== null && ipv4.slice(1, 5).every((n) => Number(n) <= 255)) ||
    DEV_SUFFIXES.some((s) => host.endsWith(s))
  if (!local) {
    const labels = host.split('.')
    const tld = labels.at(-1) ?? ''
    // 点を含み、最後のラベルが文字（数字だけ・3.14 のような小数は検索）。ファイル名らしいものは検索
    if (labels.length < 2 || !/^(\p{L}{2,}|xn--[a-z0-9-]+)$/u.test(tld)) return undefined
    if (!hasMore && FILE_EXTENSIONS.has(tld.toLowerCase())) return undefined
  }
  url.protocol = local ? 'http:' : 'https:'
  return url.href
}

// 打った文字列を、開く URL と、それが検索か（URL として読めなかったか）に分ける（F10 の候補で使う）
export function classifyInput(
  input: string,
  shortcuts: Shortcut[] = []
): { url: string; isSearch: boolean } {
  const text = input.trim()
  if (text === '' || text.toLowerCase() === 'about:blank')
    return { url: 'about:blank', isSearch: false }
  // 「?語」は必ず検索（Chrome と同じ）
  if (text.startsWith('?')) return { url: search(text.slice(1).trim()), isSearch: true }
  // 1〜65535 の数字だけ → localhost のそのポート（F10）
  if (/^\d{1,5}$/.test(text) && Number(text) >= 1 && Number(text) <= 65535) {
    return { url: `http://localhost:${Number(text)}/`, isSearch: false }
  }
  // 「近道のキーワード 語」 → その近道の URL（区切りは全角スペースやタブでもよい）
  const words = /^(\S+)\s+(.+)$/su.exec(text)
  const shortcut = words && shortcuts.find((s) => s.keyword === words[1]!.toLowerCase())
  if (shortcut) {
    const url = shortcut.urlTemplate.replaceAll('%s', encodeURIComponent(words![2]!.trim()))
    if (isAllowedPageUrl(url)) return { url, isSearch: false }
  }
  // スキームつき（http: と https: だけ開く。http:/a のような書き損じも URL として読む）
  if (/^https?:/i.test(text) && !/\s/.test(text) && isAllowedPageUrl(text)) {
    return { url: new URL(text).href, isSearch: false }
  }
  if (!/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text) && !/\s/.test(text)) {
    const url = asHost(text)
    if (url) return { url, isSearch: false }
  }
  return { url: search(text), isSearch: true }
}

export function resolveInput(input: string, shortcuts: Shortcut[] = []): string {
  return classifyInput(input, shortcuts).url
}
