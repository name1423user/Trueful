// メインウィンドウ（UI）が移動してよい URL か。自分の画面だけを許す。
// appUrl はビルド後なら renderer の index.html の file:// URL、開発中なら開発サーバーの URL
export function isAppUrl(url: string, appUrl: string): boolean {
  try {
    const target = new URL(url)
    const app = new URL(appUrl)
    if (app.protocol === 'file:')
      return target.protocol === 'file:' && target.pathname === app.pathname
    return target.origin === app.origin
  } catch {
    return false
  }
}
