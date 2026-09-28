// T1-3a: Electron 44 の Main プロセスで bench.mjs を実行する。ウィンドウは出さない。
// 結果は results/<label>-<platform>-<arch>.json。使い方: electron . --label=before-rebuild
import { app } from 'electron'
import { runAll, labelFromArgv } from './bench.mjs'

app.whenReady().then(async () => {
  await runAll(labelFromArgv(process.argv))
  app.quit()
})

// ウィンドウを出さないので、全ウィンドウが閉じたときの既定の終了は使わない
app.on('window-all-closed', () => {})
