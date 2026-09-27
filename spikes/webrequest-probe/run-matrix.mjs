// 条件の組み合わせを順に実行し、各回の結果の行だけを集める
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const electron = path.join(import.meta.dirname, 'node_modules', '.bin', 'electron')
const cases = [
  ...['3', '2'].flatMap((mv) => ['none', 'ext', 'store', 'both'].map((lib) => ({ mv, lib, part: 'persist', adblock: 'off' }))),
  ...['3', '2'].map((mv) => ({ mv, lib: 'none', part: 'default', adblock: 'off' })),
  ...['3', '2'].map((mv) => ({ mv, lib: 'both', part: 'persist', adblock: 'on' })),
]
// ses.clearData() では拡張の service worker の古いスクリプトが消えないので、毎回、保存場所ごと消す（macOS の場所）
const userData = path.join(os.homedir(), 'Library', 'Application Support', 'trueful-spike-webrequest-probe')
for (const c of cases) {
  fs.rmSync(userData, { recursive: true, force: true })
  const args = ['.', ...Object.entries(c).map(([k, v]) => `--${k}=${v}`)]
  let out
  try {
    out = execFileSync(electron, args, { cwd: import.meta.dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 })
  } catch (e) {
    out = `${e.stdout ?? ''}\n[probe] ${args.join(' ')} 失敗: ${e.message.split('\n')[0]}`
  }
  console.log(out.split('\n').filter((l) => l.startsWith('[probe]')).join('\n'))
}
