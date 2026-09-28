import { app, BrowserWindow, session, shell } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { initDatabase } from './db/flows/initDatabase'
import { isAppUrl } from './window/services/appUrl'
import { isExternalUrl } from './window/services/externalUrl'

// E2E などで、保存場所を普段の userData から切り替える。配布版では使わない
const userDataDir = process.env['TRUEFUL_USER_DATA_DIR']
if (!app.isPackaged && userDataDir) app.setPath('userData', userDataDir)

// DB の接続。準備（非同期）の途中で終了が始まったら、準備が終わったところで閉じる
let database: DatabaseSync | undefined
let quitting = false

// UI から外へ出るリンクは、http(s) だけ既定のブラウザに渡す
function openExternal(url: string): void {
  if (!isExternalUrl(url)) return
  shell.openExternal(url).catch((e) => console.error('[main] openExternal に失敗', e))
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      // セキュリティの設定は無効にしない（CLAUDE.md の境界線）
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  const devServer = process.env['ELECTRON_RENDERER_URL']
  const appUrl =
    !app.isPackaged && devServer
      ? devServer
      : pathToFileURL(join(__dirname, '../renderer/index.html')).href

  // UI から新しいウィンドウは開かない。UI 自身も自分の画面の外へは移動させない
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  const guard = (event: Electron.Event<{ url: string }>): void => {
    if (isAppUrl(event.url, appUrl)) return
    event.preventDefault()
    openExternal(event.url)
  }
  mainWindow.webContents.on('will-navigate', guard)
  mainWindow.webContents.on('will-redirect', guard)

  mainWindow.loadURL(appUrl)
}

app.whenReady().then(() => {
  // UI のセッション（既定のセッション）は、カメラ・通知などの権限をすべて拒否する。
  // Web ページ用のセッションの権限は、M2 以降で別に決める。
  // UI の renderer では Clipboard API や全画面も使えなくなるので、クリップボードは IPC 経由で Main の clipboard を使う
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )
  session.defaultSession.setPermissionCheckHandler(() => false)

  // 失敗したときの復元と通知は F12 で行う。ここでは記録だけする
  initDatabase(app.getPath('userData'))
    .then((db) => {
      if (quitting) db.close()
      else database = db
    })
    .catch((e) => console.error('[main] DB の準備に失敗', e))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 終了は止めない（止めると、あとの app.quit() が効かずに終了できなくなる）
app.on('will-quit', () => {
  quitting = true
  database?.close()
  database = undefined
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
