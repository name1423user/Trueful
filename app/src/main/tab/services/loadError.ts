// ページの読み込みの失敗（F16）。Chromium の net エラー番号を、画面に出す種類に分ける
export type LoadErrorKind = 'offline' | 'certificate' | 'load-failed'

// 画面に出す失敗の内容（PageState に載せて、Renderer のエラー画面に渡す）
export type LoadError = { kind: LoadErrorKind; url: string; description: string }

// ignore は、エラー画面を出さない（取りやめ。別のページへ移った・自分で止めたとき）
export function classifyLoadError(code: number): LoadErrorKind | 'ignore' {
  if (code === -3) return 'ignore' // ERR_ABORTED
  if (code === -106) return 'offline' // INTERNET_DISCONNECTED（NETWORK_CHANGED -21 は、Chromium が自動でやり直すので、offline にしない）
  if (code <= -200 && code >= -299) return 'certificate' // ERR_CERT_*
  return 'load-failed'
}
