// T0-4（R4）: 統合検索欄の候補一覧を Webページの上に出せるかの試作。
// 使い捨て。本体（app/）から import しない。
import { app, BaseWindow, WebContentsView, Menu, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// overlay: 候補一覧を専用の View としてページの上に重ねる
// push: 候補一覧が開いている間だけ、ページを固定の高さだけ下げ、空いた隙間に同じ View を置く
const MODES = ['overlay', 'push']
const mode = process.argv.find((a) => a.startsWith('--mode='))?.split('=')[1] ?? 'overlay'
if (!MODES.includes(mode)) { console.error(`[spike] --mode は ${MODES.join(' / ')} のどれか: ${mode}`); process.exit(1) }

app.setPath('userData', path.join(app.getPath('appData'), 'trueful-spike-omnibox-popup'))
const SCREENSHOT_DIR = path.join(import.meta.dirname, 'screenshots', 'raw')
const INPUT_H = 44
const POPUP_H = 28 * 8 + 6 // 候補は常に8件（高さを固定して毎回同じ動きにする）
const MARGIN = 8

// 候補の中身は範囲外。入力から8件をその場で作る（通信しない）
const suggest = (t) => {
  const slug = encodeURIComponent(t.trim().toLowerCase().replace(/\s+/g, '-'))
  return [`${t} を検索`, `${t} を画像で検索`, `https://${slug}.example.com/`, `https://example.com/${slug}`,
    `タブ: ${t} のページ`, `履歴: ${t} - ドキュメント`, `ブックマーク: ${t}`, `操作: ${t} を実行`]
}

const views = {}
const state = { open: false, items: [], index: -1, seq: 0 }
const sentAt = new Map()
let win
function layout() {
  const { width, height } = win.getContentBounds()
  const pushed = mode === 'push' && state.open ? POPUP_H : 0
  views.input.setBounds({ x: 0, y: 0, width, height: INPUT_H })
  views.page.setBounds({ x: 0, y: INPUT_H + pushed, width, height: Math.max(0, height - INPUT_H - pushed) })
  views.popup.setBounds({ x: MARGIN, y: INPUT_H, width: Math.max(0, width - MARGIN * 2), height: POPUP_H })
  views.popup.setVisible(state.open)
}
const render = (seq = 0) => views.popup.webContents.send('spike:state', { seq, items: state.items, index: state.index })
function setOpen(open) {
  if (state.open === open) return
  state.open = open
  layout()
}
function decide(index) {
  console.log(`[spike] 決定: ${state.items[index]}`)
  setOpen(false)
  views.input.webContents.focus() // 候補をクリックしたときも、フォーカスは検索欄に戻す
}

function registerIpc() {
  // 送り手の View を確かめ、引数を検証してから処理する
  const on = (channel, name, handler) =>
    ipcMain.on(channel, (e, value) => e.sender === views[name].webContents && handler(value))
  on('spike:input', 'input', (text) => {
    if (typeof text !== 'string' || text.length > 200) return
    if (!text.trim()) return setOpen(false)
    Object.assign(state, { items: suggest(text), index: -1, seq: state.seq + 1 })
    sentAt.set(state.seq, performance.now())
    setOpen(true)
    render(state.seq)
  })
  on('spike:key', 'input', (key) => {
    if (!state.open) return
    const n = state.items.length
    if (key === 'enter') return decide(Math.max(state.index, 0))
    if (key === 'escape') return setOpen(false)
    if (key !== 'up' && key !== 'down') return
    state.index = (state.index + (key === 'down' ? 1 : n - 1)) % n
    console.log(`[spike] 選択: ${state.index} ${state.items[state.index]}`)
    render()
  })
  on('spike:pick', 'popup', (i) => Number.isInteger(i) && i >= 0 && i < state.items.length && decide(i))
  on('spike:ack', 'popup', (seq) => {
    if (!sentAt.has(seq)) return
    console.log(`[spike] 候補の更新: ${(performance.now() - sentAt.get(seq)).toFixed(1)}ms`)
    sentAt.delete(seq)
  })
}

async function saveScreenshots() {
  // BaseWindow には capturePage がないので View ごとに保存する。重なりの証拠は OS のスクリーンショットで撮る
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  for (const [name, view] of Object.entries(views)) {
    const file = path.join(SCREENSHOT_DIR, `${mode}-${stamp}-${name}.png`)
    fs.writeFileSync(`${file}.tmp`, (await view.webContents.capturePage()).toPNG())
    fs.renameSync(`${file}.tmp`, file)
    console.log(`[spike] スクリーンショットを保存: ${file}`)
  }
}

function buildMenu() {
  const devtools = (name) => () => views[name].webContents.openDevTools({ mode: 'detach' })
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: '試作', submenu: [
      { label: 'スクリーンショットを保存', accelerator: 'CmdOrCtrl+S', click: saveScreenshots },
      ...[['input', '検索欄'], ['popup', '候補一覧'], ['page', 'ページ']].map(([name, label], i) =>
        ({ label: `DevTools（${label}）`, accelerator: `CmdOrCtrl+Alt+${i + 1}`, click: devtools(name) })),
      { label: '再読み込み（すべて）', accelerator: 'CmdOrCtrl+R', click: () => Object.values(views).forEach((v) => v.webContents.reload()) },
      { type: 'separator' },
      { role: 'quit', label: '終了' },
    ] },
    { role: 'editMenu', label: '編集' },
  ]))
}

// 自動の起動確認用（--self-test）: 検索欄に abc を打ち、下・下・上・Esc を送って終了する
async function runSelfTest() {
  const wc = views.input.webContents
  const wait = () => new Promise((r) => setTimeout(r, 200))
  for (const c of 'abc') { wc.sendInputEvent({ type: 'char', keyCode: c }); await wait() }
  for (const k of ['Down', 'Down', 'Up', 'Escape']) { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); await wait() }
  console.log(`[spike] 自己テスト: 候補一覧=${state.open ? '開' : '閉'} 選択=${state.index}`)
  app.quit()
}

function createWindow() {
  win = new BaseWindow({ width: 1000, height: 700, title: `[${mode}] 検索候補の試作` })
  const preload = path.join(import.meta.dirname, 'preload.cjs')
  // ページには preload を渡さない。最後に追加した View（popup）が最前面になる
  for (const name of ['input', 'page', 'popup']) {
    const webPreferences = { contextIsolation: true, sandbox: true, nodeIntegration: false }
    if (name !== 'page') webPreferences.preload = preload
    views[name] = new WebContentsView({ webPreferences })
    win.contentView.addChildView(views[name])
    views[name].webContents.on('focus', () => console.log(`[spike] フォーカス: ${name}`))
  }
  layout()
  win.on('resize', layout)
  win.on('move', layout)
  registerIpc()
  buildMenu()

  console.log(`[spike] モード: ${mode}`)
  console.log(`[spike] versions: electron=${process.versions.electron} chrome=${process.versions.chrome} os=${process.platform}-${process.arch}`)
  console.log(`[spike] userData: ${app.getPath('userData')}`)
  // 3つとも読み込み終えてから検索欄にフォーカスする（先に当てると、あとから読み込んだ View に奪われる）
  const load = (name) => views[name].webContents.loadFile(path.join(import.meta.dirname, `${name}.html`))
  Promise.all(['popup', 'page', 'input'].map(load)).then(() => {
    views.input.webContents.focus()
    if (process.argv.includes('--self-test')) runSelfTest()
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
