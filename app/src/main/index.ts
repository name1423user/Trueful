import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { isAppUrl } from './window/services/appUrl'
import { isExternalUrl } from './window/services/externalUrl'

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

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
