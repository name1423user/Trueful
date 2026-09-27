// T0-2（R2）: electron-chrome-extensions と electron-chrome-web-store で、必要な拡張が動くかの試作。
// 使い捨て。本体（app/）から import しない。
import { app, BaseWindow, WebContentsView, Menu, ipcMain, session } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { installChromeWebStore } from 'electron-chrome-web-store'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const unpackedDir = arg('load-unpacked')

app.setPath('userData', path.join(app.getPath('appData'), 'trueful-spike-extensions'))
const SCREENSHOT_DIR = path.join(import.meta.dirname, 'screenshots', 'raw')
const TOOLBAR_HEIGHT = 44
const WEB_STORE = 'https://chromewebstore.google.com/'

// A・B は「別の Workspace」に当たる。拡張の保存先（userData/Extensions）は共通なので、
// 片方で入れた拡張は、再起動後に両方で読み込まれる（SPEC の「全Workspace共通」に相当）
const TABS = { a: 'persist:spike-ext-a', b: 'persist:spike-ext-b' }
let win, toolbar
const views = {}
let active = 'a'

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(`${file}.tmp`, data)
  fs.renameSync(`${file}.tmp`, file)
}

// sandbox の preload は node_modules を require できない。browser-action は electron だけに依存する
// 1ファイルなので、試作用の API を足して1枚の preload として書き出す（本体ではバンドラーで作る）
function writeToolbarPreload() {
  const require = createRequire(import.meta.url)
  const src = fs.readFileSync(require.resolve('electron-chrome-extensions/browser-action'), 'utf8')
  const file = path.join(app.getPath('userData'), 'toolbar.preload.js')
  writeAtomic(file, `${src}
module.exports.injectBrowserAction()
const { contextBridge: cb, ipcRenderer: ipc } = require('electron')
cb.exposeInMainWorld('spike', {
  selectTab: (id) => ipc.send('spike:select-tab', id),
  navigate: (url) => ipc.send('spike:navigate', url),
  onState: (fn) => ipc.on('spike:state', (_e, s) => fn(s)),
})
`)
  return file
}

function sendState() {
  const wc = views[active].webContents
  toolbar.webContents.send('spike:state', { active, partition: TABS[active], url: wc.getURL() })
}

// 表示だけを切り替える。拡張（chrome.tabs.update）から呼ばれるのはこちら
function showTab(id) {
  if (!views[id]) return
  active = id
  for (const [k, v] of Object.entries(views)) v.setVisible(k === id)
  win.setTitle(`[${id.toUpperCase()}] ${views[id].webContents.getTitle()}`)
  sendState()
}

function selectTab(id) {
  showTab(id)
  ElectronChromeExtensions.fromSession(views[id].webContents.session)?.selectTab(views[id].webContents)
}

function layout() {
  const { width, height } = win.getContentBounds()
  toolbar.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT })
  for (const v of Object.values(views)) v.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: height - TOOLBAR_HEIGHT })
}

async function createTab(id) {
  const ses = session.fromPartition(TABS[id])
  // T0-1 の推奨に合わせて Electron/ を除く（ストアの「Chrome に追加」の判定にも効く）
  ses.setUserAgent(ses.getUserAgent().replace(/\sElectron\/\S+/, ''))
  const view = new WebContentsView({
    webPreferences: { session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  const extensions = new ElectronChromeExtensions({
    license: 'GPL-3.0', // 試作は配布しない。本体のライセンスは別途判断（RESULT.md 4章）
    session: ses,
    // 試作はタブ1枚なので、拡張が新しいタブを開こうとしたら同じタブで開く
    createTab: async (details) => {
      if (details.url) await view.webContents.loadURL(details.url)
      return [view.webContents, win]
    },
    selectTab: () => showTab(id),
  })
  await installChromeWebStore({ session: ses })
  if (unpackedDir) {
    const ext = await ses.extensions.loadExtension(path.resolve(unpackedDir), { allowFileAccess: true })
    console.log(`[spike] unpacked を読み込み（${id}）: ${ext.name} ${ext.id}`)
  }
  for (const ext of ses.extensions.getAllExtensions()) console.log(`[spike] 拡張（${id}）: ${ext.name} ${ext.version} ${ext.id}`)

  views[id] = view
  win.contentView.addChildView(view)
  extensions.addTab(view.webContents, win)
  const wc = view.webContents
  wc.on('did-navigate', (_e, url) => { console.log(`[spike] 移動（${id}）: ${url}`); if (id === active) sendState() })
  wc.on('did-navigate-in-page', () => id === active && sendState())
  wc.on('page-title-updated', () => id === active && win.setTitle(`[${id.toUpperCase()}] ${wc.getTitle()}`))
  // 翻訳拡張などは右クリックメニューから使うので、拡張の項目を出す
  wc.on('context-menu', (_e, params) => {
    const items = extensions.getContextMenuItems(wc, params)
    Menu.buildFromTemplate([...items, { type: 'separator' }, { label: '検証', click: () => wc.inspectElement(params.x, params.y) }]).popup()
  })
  wc.loadURL(WEB_STORE)
}

async function saveScreenshot() {
  const image = await views[active].webContents.capturePage()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(SCREENSHOT_DIR, `${active}-${stamp}.png`)
  writeAtomic(file, image.toPNG())
  console.log(`[spike] スクリーンショットを保存: ${file}`)
}

function buildMenu() {
  const current = () => views[active].webContents
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      {
        label: '試作',
        submenu: [
          { label: 'タブ A', accelerator: 'CmdOrCtrl+1', click: () => selectTab('a') },
          { label: 'タブ B', accelerator: 'CmdOrCtrl+2', click: () => selectTab('b') },
          { label: 'Chrome ウェブストア', accelerator: 'CmdOrCtrl+Shift+S', click: () => current().loadURL(WEB_STORE) },
          { label: '戻る', accelerator: 'Alt+Left', click: () => current().navigationHistory.goBack() },
          { label: '再読み込み', accelerator: 'CmdOrCtrl+R', click: () => current().reload() },
          { label: 'スクリーンショットを保存', accelerator: 'CmdOrCtrl+S', click: saveScreenshot },
          { label: 'ページの DevTools', accelerator: 'CmdOrCtrl+Alt+I', click: () => current().openDevTools() },
          { label: 'ツールバーの DevTools', click: () => toolbar.webContents.openDevTools({ mode: 'detach' }) },
          { type: 'separator' },
          { role: 'quit', label: '終了' },
        ],
      },
      { role: 'editMenu', label: '編集' },
    ]),
  )
}

async function main() {
  console.log(`[spike] versions: electron=${process.versions.electron} chrome=${process.versions.chrome} os=${process.platform}-${process.arch}`)
  console.log(`[spike] userData: ${app.getPath('userData')}`)
  win = new BaseWindow({ width: 1200, height: 850 })
  toolbar = new WebContentsView({
    webPreferences: { preload: writeToolbarPreload(), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  // 拡張のアイコン（crx://）は、<browser-action-list> がある側のセッションで扱う
  ElectronChromeExtensions.handleCRXProtocol(toolbar.webContents.session)
  win.contentView.addChildView(toolbar)
  await createTab('a')
  await createTab('b')
  selectTab('a') // addTab のたびにライブラリが最後のタブを選ぶので、A に戻す
  layout()
  win.on('resize', layout)

  // 受け取る値は決まった形だけ通す
  ipcMain.on('spike:select-tab', (e, id) => { if (e.sender === toolbar.webContents && id in TABS) selectTab(id) })
  ipcMain.on('spike:navigate', (e, url) => {
    if (e.sender !== toolbar.webContents || typeof url !== 'string') return
    const target = /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`
    views[active].webContents.loadURL(target).catch((err) => console.log(`[spike] 読み込み失敗: ${err.message}`))
  })
  toolbar.webContents.on('did-finish-load', () => selectTab(active))
  toolbar.webContents.loadFile(path.join(import.meta.dirname, 'toolbar.html'))
  buildMenu()
}

if (process.argv.includes('--reset')) {
  // A・B のログイン状態と、入れた拡張をまとめて消す
  app.whenReady().then(async () => {
    for (const p of Object.values(TABS)) {
      await session.fromPartition(p).clearData()
      console.log(`[spike] 消去: ${p}`)
    }
    fs.rmSync(path.join(app.getPath('userData'), 'Extensions'), { recursive: true, force: true })
    console.log('[spike] 消去: Extensions/')
    app.quit()
  })
} else {
  app.whenReady().then(main)
  app.on('window-all-closed', () => app.quit())
}
