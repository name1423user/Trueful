// T0-5 の追加調査: 拡張の chrome.webRequest が呼ばれない原因を、条件を1つずつ変えて切り分ける。
// 使い捨て。本体（app/）から import しない。
// 例: electron . --mv=3 --lib=none --part=persist --adblock=off
import { app, BaseWindow, WebContentsView, session } from 'electron'
import path from 'node:path'

const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def
const opt = { mv: arg('mv', '3'), lib: arg('lib', 'none'), part: arg('part', 'persist'), adblock: arg('adblock', 'off') }
const label = Object.entries(opt).map(([k, v]) => `${k}=${v}`).join(' ')

app.setPath('userData', path.join(app.getPath('appData'), 'trueful-spike-webrequest-probe'))
const counts = {}
const record = (msg) => {
  if (typeof msg !== 'string' || !msg.startsWith('[probe-ext]')) return
  const name = msg.split(' ')[1]
  counts[name] = (counts[name] ?? 0) + 1
}

// MV2 の background page と、拡張のページの console を拾う
app.on('web-contents-created', (_e, wc) => wc.on('console-message', (e, _lv, message) => record(e.message ?? message)))

async function main() {
  const ses = opt.part === 'default' ? session.defaultSession : session.fromPartition('persist:probe')
  await ses.clearData() // 前の回の service worker を残さない
  // MV3 の service worker の console を拾う
  ses.serviceWorkers.on('console-message', (e, details) => record(e.message ?? details?.message))

  if (opt.adblock === 'on') {
    const { ElectronBlocker } = await import('@ghostery/adblocker-electron')
    ;(await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInSession(ses)
  }
  let extensions
  if (opt.lib === 'ext' || opt.lib === 'both') {
    const { ElectronChromeExtensions } = await import('electron-chrome-extensions')
    extensions = new ElectronChromeExtensions({ license: 'GPL-3.0', session: ses })
  }
  if (opt.lib === 'store' || opt.lib === 'both') {
    const { installChromeWebStore } = await import('electron-chrome-web-store')
    await installChromeWebStore({ session: ses, loadExtensions: false, autoUpdate: false })
  }
  const ext = await ses.extensions.loadExtension(path.join(import.meta.dirname, 'fixtures', `mv${opt.mv}`))

  const win = new BaseWindow({ width: 900, height: 700, show: false })
  const view = new WebContentsView({
    webPreferences: { session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  win.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, width: 900, height: 700 })
  extensions?.addTab(view.webContents, win)

  await new Promise((r) => setTimeout(r, 1500)) // 拡張の起動を待つ
  for (const url of ['https://example.com/', 'https://en.wikipedia.org/wiki/Electron_(software_framework)']) {
    await view.webContents.loadURL(url).catch((err) => console.log(`  読み込み失敗: ${err.message}`))
    await new Promise((r) => setTimeout(r, 2500))
  }
  console.log(`[probe] ${label} ext=${ext.name} 結果=${JSON.stringify(counts)}`)
  app.quit()
}

app.whenReady().then(main)
