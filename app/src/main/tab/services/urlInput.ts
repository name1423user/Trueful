// アドレスバーに打った文字列を、開く URL に変える（F02、F10 の近道）。
// 開けるのは http・https と空のタブだけ（file:・javascript: などは開かない）
export type Shortcut = { keyword: string; urlTemplate: string }

// 既定の検索エンジン（設定で変えられるようにするのは F14 の項目を足すとき）
export const DEFAULT_SEARCH_TEMPLATE = 'https://www.google.com/search?q=%s'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

// 開いてよい URL か（ページ内のリンクやリダイレクトの行き先も、これで確かめる）
export function isAllowedPageUrl(url: string): boolean {
  if (url === 'about:blank') return true
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

function fill(template: string, query: string): string {
  return template.replace('%s', encodeURIComponent(query))
}

// ホスト名らしいか（例: example.com、localhost:3000、192.168.0.1/path）
function looksLikeHost(text: string): boolean {
  return /^(localhost|[\w-]+(\.[\w-]+)+|\[[0-9a-f:]+\])(:\d{1,5})?([/?#].*)?$/i.test(text)
}

export function resolveInput(input: string, shortcuts: Shortcut[] = []): string {
  const text = input.trim()
  if (text === '') return 'about:blank'
  // 1〜65535 の数字だけ → localhost のそのポート（F10）
  if (/^\d{1,5}$/.test(text) && Number(text) >= 1 && Number(text) <= 65535) {
    return `http://localhost:${Number(text)}/`
  }
  // 「近道のキーワード 語」 → その近道の URL
  const space = text.indexOf(' ')
  if (space > 0) {
    const shortcut = shortcuts.find((s) => s.keyword === text.slice(0, space).toLowerCase())
    if (shortcut) return fill(shortcut.urlTemplate, text.slice(space + 1).trim())
  }
  if (!/\s/.test(text)) {
    // スキームつき（http・https だけ開く。ほかは検索語として扱う）
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
      if (isAllowedPageUrl(text)) return new URL(text).href
    } else if (looksLikeHost(text)) {
      // localhost と IP は http、それ以外は https で開く
      const local = /^(localhost|\d+\.\d+\.\d+\.\d+|\[)/i.test(text)
      const url = `${local ? 'http' : 'https'}://${text}`
      if (isAllowedPageUrl(url)) return new URL(url).href
    }
  }
  return fill(DEFAULT_SEARCH_TEMPLATE, text)
}
