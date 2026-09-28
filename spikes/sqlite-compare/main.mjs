// T1-3a: Electron 44 の Main プロセスで bench.mjs を実行する。ウィンドウは出さない。
// 結果は results/<label>-<platform>-<arch>.json。使い方: pnpm start -- --label=electron44
import { app } from 'electron'
import { runAll, labelFromArgv } from './bench.mjs'

app.whenReady().then(async () => {
  // 途中で失敗しても終了させる（終了しないと CI が制限時間まで止まる）。書き込みは同期なので app.exit でよい
  try {
    await runAll(labelFromArgv(process.argv))
    app.exit(0)
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
})

// ウィンドウを出さないので、全ウィンドウが閉じたときの既定の終了は使わない
app.on('window-all-closed', () => {})
