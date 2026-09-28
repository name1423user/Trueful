// ページに送る User-Agent。Electron の既定から `Electron/<版>` だけを除く。
// 付いたままだと、Google が簡易版のログイン画面（WebLiteSignIn）を出すため（spikes/google-login/RESULT.md の B）
export function pageUserAgent(original: string): string {
  return original.replace(/\sElectron\/\S+/, '')
}
