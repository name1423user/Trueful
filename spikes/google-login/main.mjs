// T0-1（R1）: Electron 44 の WebContentsView で Google にログインでき、再起動後も保持されるかの試作。
// 使い捨て。本体（app/）から import しない。
import { app, BaseWindow, WebContentsView, Menu, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const MODES = ['default', 'strip-electron', 'chrome-like']
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const mode = arg('ua') ?? 'default'
if (!MODES.includes(mode)) {
  console.error(`[spike] --ua は ${MODES.join(' / ')} のどれか: ${mode}`)
  process.exit(1)
}

// 保存場所を固定して、手順書から消せるようにする
app.setPath('userData', path.join(app.getPath('appData'), 'trueful-spike-google-login'))
// raw/ は git に入れない。メールアドレス等を隠したものだけ screenshots/ に移してコミットする
const SCREENSHOT_DIR = path.join(import.meta.dirname, 'screenshots', 'raw')

const URLS = {
  login: 'https://accounts.google.com/',
  account: 'https://myaccount.google.com/',
}

// モードごとにパーティションを分け、モード間でログインが混ざらないようにする
const partitionOf = (m) => `persist:spike-google-${m}`

function userAgentFor(m, original) {
  if (m === 'default') return original
  const withoutElectron = original.replace(/\sElectron\/\S+/, '')
  if (m === 'strip-electron') return withoutElectron
  // chrome-like: アプリ名/版（例: trueful-spike-google-login/0.0.0）も除き、Chrome と同じ形にする
  return withoutElectron.replace(new RegExp(`\\s${app.getName()}/\\S+`, 'i'), '')
}

function logClientHints(ses) {
  // UA を変えても送られるクライアントヒントを、ホストごとに1回だけ記録する（Cookie 等は出さない）
  const seen = new Set()
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*.google.com/*'] }, (details, callback) => {
    const host = new URL(details.url).host
    if (!seen.has(host)) {
      seen.add(host)
      const picked = Object.fromEntries(
        Object.entries(details.requestHeaders).filter(([k]) => /^(user-agent|sec-ch-ua.*)$/i.test(k)),
      )
      console.log(`[spike] 送信ヘッダー ${host}:`, JSON.stringify(picked, null, 2))
    }
    callback({ requestHeaders: details.requestHeaders })
  })
}

async function saveScreenshot(view) {
  const image = await view.webContents.capturePage()
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(SCREENSHOT_DIR, `${mode}-${stamp}.png`)
  fs.writeFileSync(`${file}.tmp`, image.toPNG())
  fs.renameSync(`${file}.tmp`, file)
  console.log(`[spike] スクリーンショットを保存: ${file}`)
}

function buildMenu(win, view) {
  const go = (url) => () => view.webContents.loadURL(url)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      {
        label: '試作',
        submenu: [
          { label: 'Google ログイン画面', accelerator: 'CmdOrCtrl+1', click: go(URLS.login) },
          { label: 'Google アカウント（保持の確認）', accelerator: 'CmdOrCtrl+2', click: go(URLS.account) },
          { label: '戻る', accelerator: 'Alt+Left', click: () => view.webContents.navigationHistory.goBack() },
          { label: '再読み込み', accelerator: 'CmdOrCtrl+R', click: () => view.webContents.reload() },
          { label: 'スクリーンショットを保存', accelerator: 'CmdOrCtrl+S', click: () => saveScreenshot(view) },
          { label: 'DevTools', accelerator: 'CmdOrCtrl+Alt+I', click: () => view.webContents.openDevTools() },
          { type: 'separator' },
          { role: 'quit', label: '終了' },
        ],
      },
      { role: 'editMenu', label: '編集' },
    ]),
  )
}

function createWindow() {
  const ses = session.fromPartition(partitionOf(mode))
  const ua = userAgentFor(mode, ses.getUserAgent())
  ses.setUserAgent(ua)
  logClientHints(ses)

  const win = new BaseWindow({ width: 1100, height: 800 })
  const view = new WebContentsView({
    webPreferences: { session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  win.contentView.addChildView(view)
  const layout = () => {
    const { width, height } = win.getContentBounds()
    view.setBounds({ x: 0, y: 0, width, height })
  }
  layout()
  win.on('resize', layout)

  view.webContents.on('page-title-updated', (_e, title) => win.setTitle(`[${mode}] ${title}`))
  view.webContents.on('did-navigate', (_e, url) => console.log(`[spike] 移動: ${url}`))
  buildMenu(win, view)

  console.log(`[spike] モード: ${mode} / パーティション: ${partitionOf(mode)}`)
  console.log(`[spike] versions: electron=${process.versions.electron} chrome=${process.versions.chrome} os=${process.platform}-${process.arch}`)
  console.log(`[spike] userData: ${app.getPath('userData')}`)
  console.log(`[spike] User-Agent: ${ua}`)
  view.webContents.loadURL(URLS.login)
}

if (process.argv.includes('--reset')) {
  // 3モードのログイン状態をまとめて消し、まっさらな状態に戻す
  app.whenReady().then(async () => {
    for (const m of MODES) {
      await session.fromPartition(partitionOf(m)).clearData()
      console.log(`[spike] 消去: ${partitionOf(m)}`)
    }
    app.quit()
  })
} else {
  app.whenReady().then(createWindow)
  app.on('window-all-closed', () => app.quit())
}
