import { posix, win32 } from 'node:path'
import { isBookmarkUrl, MAX_DEPTH, type ImportNode, type ParsedBookmarks } from './bookmarkTree'

// Chrome の Bookmarks ファイル（プロファイルの中の JSON）を、ブックマークの木にする（F08）。
// 空のフォルダは取り込まない。壊れたノード・使えない URL は failed に数えて、ほかは続ける。
// JSON でない・roots がないときは、Bookmarks ファイルではないので例外
export function parseChromeBookmarks(json: string): ParsedBookmarks {
  const data: unknown = JSON.parse(json)
  const roots = (data as { roots?: unknown } | null)?.roots
  if (typeof roots !== 'object' || roots === null) throw new Error('Bookmarks ファイルではない')
  let failed = 0
  const convert = (node: unknown, depth = 0): ImportNode | undefined => {
    const n = node as { type?: unknown; name?: unknown; url?: unknown; children?: unknown }
    if (typeof n !== 'object' || n === null) return void failed++
    const title = typeof n.name === 'string' ? n.name : ''
    // 深すぎる入れ子は取り込まない（再帰で溢れさせない）
    if (depth > MAX_DEPTH) return void failed++
    if (n.type === 'folder' && Array.isArray(n.children)) {
      const children = n.children.flatMap((c) => convert(c, depth + 1) ?? [])
      return children.length > 0 ? { kind: 'folder', title, children } : undefined
    }
    if (n.type === 'url' && typeof n.url === 'string' && isBookmarkUrl(n.url)) {
      return { kind: 'url', title, url: n.url }
    }
    failed++
    return undefined
  }
  // roots には、フォルダ以外の値（sync_transaction_version など）も入る。数えずに飛ばす
  const nodes = Object.values(roots)
    .filter((root) => typeof root === 'object' && root !== null)
    .flatMap((root) => convert(root) ?? [])
  return { nodes, failed }
}

// 3 OS の Chrome のプロファイルの中にある Bookmarks ファイルの場所。あるものだけを、Default を先にして返す。
// macOS: ~/Library/Application Support/Google/Chrome、Windows: %LOCALAPPDATA%\Google\Chrome\User Data、
// Linux: ~/.config/google-chrome と ~/.config/chromium（Chromium は Linux だけ）
export function chromeBookmarkFiles(env: {
  platform: NodeJS.Platform
  home: string
  localAppData?: string
  exists: (path: string) => boolean
  listDir: (path: string) => string[]
}): string[] {
  const path = env.platform === 'win32' ? win32 : posix
  const roots =
    env.platform === 'darwin'
      ? [path.join(env.home, 'Library', 'Application Support', 'Google', 'Chrome')]
      : env.platform === 'win32'
        ? [
            path.join(
              env.localAppData || path.join(env.home, 'AppData', 'Local'),
              'Google',
              'Chrome',
              'User Data'
            )
          ]
        : [
            path.join(env.home, '.config', 'google-chrome'),
            path.join(env.home, '.config', 'chromium')
          ]
  return roots.flatMap((root) => {
    let names: string[] = []
    try {
      names = env.listDir(root)
    } catch {
      return []
    }
    // Default、Profile 1、Profile 2…（System Profile などは Bookmarks を持たない）
    return names
      .filter((n) => n === 'Default' || /^Profile \d+$/.test(n))
      .sort((a, b) =>
        a === 'Default' ? -1 : b === 'Default' ? 1 : a.localeCompare(b, 'en', { numeric: true })
      )
      .map((n) => path.join(root, n, 'Bookmarks'))
      .filter((file) => {
        try {
          return env.exists(file)
        } catch {
          return false
        }
      })
  })
}
