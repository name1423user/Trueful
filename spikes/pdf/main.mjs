// T0-3（R3）: Electron 44 の WebContentsView で Chromium の PDF ビューアが使えるかの試作。
// 使い捨て。本体（app/）から import しない。
import { app, BaseWindow, WebContentsView, Menu, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const plugins = (arg('plugins') ?? 'true') === 'true'
const findWord = arg('find') ?? 'TRUEFUL-FIND'

const SAMPLES = {
  local: path.join(import.meta.dirname, 'fixtures', 'sample.pdf'),
  // W3C のテスト用 PDF（1ページ、本文に "Dummy PDF file"）
  url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
}
// http(s)/file の URL はそのまま、それ以外はローカルのパスとして file:// に直す
const toURL = (s) => (/^(https?|file):/.test(s) ? s : pathToFileURL(path.resolve(s)).href)
const target = toURL(arg('open') ?? SAMPLES.local)

// 保存場所を固定して、手順書から消せるようにする
app.setPath('userData', path.join(app.getPath('appData'), 'trueful-spike-pdf'))
// raw/ は git に入れない。確認したものだけ screenshots/ に移してコミットする
const SCREENSHOT_DIR = path.join(import.meta.dirname, 'screenshots', 'raw')

async function saveScreenshot(view) {
  const image = await view.webContents.capturePage()
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(SCREENSHOT_DIR, `plugins-${plugins}-${stamp}.png`)
  fs.writeFileSync(`${file}.tmp`, image.toPNG())
  fs.renameSync(`${file}.tmp`, file)
  console.log(`[spike] スクリーンショットを保存: ${file}`)
}

function buildMenu(view) {
  const wc = view.webContents
  const zoom = (d) => () => wc.setZoomLevel(d === 0 ? 0 : wc.getZoomLevel() + d)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      {
        label: '試作',
        submenu: [
          { label: 'ローカルの PDF（fixtures/sample.pdf）', accelerator: 'CmdOrCtrl+1', click: () => wc.loadURL(toURL(SAMPLES.local)) },
          { label: 'URL の PDF（W3C dummy.pdf）', accelerator: 'CmdOrCtrl+2', click: () => wc.loadURL(SAMPLES.url) },
          { label: `ページ内検索（${findWord}）`, accelerator: 'CmdOrCtrl+F', click: () => wc.findInPage(findWord) },
          { label: '次を検索', accelerator: 'CmdOrCtrl+G', click: () => wc.findInPage(findWord, { findNext: true }) },
          { label: '拡大（ページのズーム）', accelerator: 'CmdOrCtrl+=', click: zoom(1) },
          { label: '縮小（ページのズーム）', accelerator: 'CmdOrCtrl+-', click: zoom(-1) },
          { label: '等倍', accelerator: 'CmdOrCtrl+0', click: zoom(0) },
          { label: '印刷', accelerator: 'CmdOrCtrl+P', click: () => wc.print({}, (ok, why) => console.log(`[spike] 印刷: ok=${ok} ${why ?? ''}`)) },
          { label: '再読み込み', accelerator: 'CmdOrCtrl+R', click: () => wc.reload() },
          { label: 'スクリーンショットを保存', accelerator: 'CmdOrCtrl+S', click: () => saveScreenshot(view) },
          { label: 'DevTools', accelerator: 'CmdOrCtrl+Alt+I', click: () => wc.openDevTools() },
          { type: 'separator' },
          { role: 'quit', label: '終了' },
        ],
      },
      { role: 'editMenu', label: '編集' },
    ]),
  )
}

function createWindow() {
  // PDF が表示されずダウンロードに回ったら記録する。保存ダイアログを出さないよう取り消す
  session.defaultSession.on('will-download', (e, item) => {
    console.log(`[spike] will-download（表示されずダウンロードに回った）: ${item.getURL()} mime=${item.getMimeType()}`)
    e.preventDefault()
  })

  const win = new BaseWindow({ width: 1100, height: 800 })
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, plugins },
  })
  win.contentView.addChildView(view)
  const layout = () => {
    const { width, height } = win.getContentBounds()
    view.setBounds({ x: 0, y: 0, width, height })
  }
  layout()
  win.on('resize', layout)

  const wc = view.webContents
  wc.on('page-title-updated', (_e, title) => win.setTitle(`[plugins=${plugins}] ${title}`))
  wc.on('did-navigate', (_e, url) => console.log(`[spike] 移動: ${url}`))
  wc.on('did-fail-load', (_e, code, desc, url) => console.log(`[spike] 読み込み失敗: ${code} ${desc} ${url}`))
  wc.on('did-finish-load', () => console.log(`[spike] 読み込み完了: ${wc.getURL()}`))
  // PDF ビューアが動いていれば、chrome-extension://…/index.html の子フレームへの移動が出る
  wc.on('did-frame-navigate', (_e, url, _code, _status, isMain) => {
    if (!isMain) console.log(`[spike] 子フレームの移動: ${url}`)
  })
  wc.on('found-in-page', (_e, r) => console.log(`[spike] 検索: ${r.activeMatchOrdinal}/${r.matches} 件目（${findWord}）`))
  wc.on('render-process-gone', (_e, d) => console.log(`[spike] レンダラ終了: ${d.reason}`))
  buildMenu(view)

  console.log(`[spike] versions: electron=${process.versions.electron} chrome=${process.versions.chrome} os=${process.platform}-${process.arch}`)
  console.log(`[spike] plugins: ${plugins} / 開く: ${target}`)
  console.log(`[spike] userData: ${app.getPath('userData')}`)
  wc.loadURL(target)
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
