import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { initDatabase } from './db/flows/initDatabase'
import { channelNames } from './ipc/channelNames'
import { createIpc, isFromAppMainFrame } from './ipc/handle'
import { IpcHandlerError } from './ipc/channels'
import { settingsGet, settingsUpdate } from './ipc/settingsChannels'
import { tabActivate, tabClose, tabCreate, tabList, tabReopenClosed } from './ipc/tabChannels'
import { workspaceCreate, workspaceList, workspaceSwitch } from './ipc/workspaceChannels'
import { getTabState, TabFlows, TabNotFoundError } from './tab/flows/tabFlows'
import {
  createWorkspaceFlow,
  switchWorkspace,
  WorkspaceNotFoundError
} from './workspace/flows/workspaceFlows'
import {
  ensureComManifests,
  prepareWorkspaceFiles,
  purgeWorkspaceTrash
} from './workspace/flows/workspaceFileFlows'
import type { WorkspaceRoots } from './workspace/services/workspaceFiles'
import {
  getCurrentWorkspaceId,
  getWorkspace,
  listWorkspaces
} from './workspace/services/workspaceDB'
import { SettingsStore } from './settings/flows/settingsStore'
import { isAppUrl } from './window/services/appUrl'
import { isExternalUrl } from './window/services/externalUrl'

// E2E などで、保存場所を普段の userData から切り替える。配布版では使わない
const userDataDir = process.env['TRUEFUL_USER_DATA_DIR']
if (!app.isPackaged && userDataDir) app.setPath('userData', userDataDir)

// DB の接続。準備（非同期）の途中で終了が始まったら、準備が終わったところで閉じる
let database: DatabaseSync | undefined
let quitting = false
let settingsStore: SettingsStore | undefined
let mainWindow: BrowserWindow | undefined

// UI から外へ出るリンクは、http(s) だけ既定のブラウザに渡す
function openExternal(url: string): void {
  if (!isExternalUrl(url)) return
  shell.openExternal(url).catch((e) => console.error('[main] openExternal に失敗', e))
}

// UI の画面の URL。ビルド後は renderer の index.html、開発中は開発サーバー
function getAppUrl(): string {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  return !app.isPackaged && devServer
    ? devServer
    : pathToFileURL(join(__dirname, '../renderer/index.html')).href
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      // セキュリティの設定は無効にしない（CLAUDE.md の境界線）
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // 用途別の関数だけを window.trueful に公開する（app/src/preload）
      preload: join(__dirname, '../preload/index.js')
    }
  })

  mainWindow = window
  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })

  const appUrl = getAppUrl()

  // UI から新しいウィンドウは開かない。UI 自身も自分の画面の外へは移動させない
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  const guard = (event: Electron.Event<{ url: string }>): void => {
    if (isAppUrl(event.url, appUrl)) return
    event.preventDefault()
    openExternal(event.url)
  }
  window.webContents.on('will-navigate', guard)
  window.webContents.on('will-redirect', guard)

  window.loadURL(appUrl)
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
  const userData = app.getPath('userData')
  // パーティションは sessionData の下に作られる（既定では userData と同じ場所）
  const workspaceRoots: WorkspaceRoots = { userData, sessionData: app.getPath('sessionData') }
  const purgeTrash = (): void =>
    void purgeWorkspaceTrash(workspaceRoots).then((errors) => {
      if (errors.length > 0) console.warn('[main] 片付け用のフォルダを消せなかった', errors)
    })
  const databaseReady = initDatabase(userData)
  databaseReady
    .then((db) => {
      if (quitting) {
        db.close()
        return
      }
      database = db
      // Workspace の COM 側のマニフェストをそろえる（ない・壊れているものを書き直す。ADR-013）。
      // 前回消しきれなかった片付け用のフォルダも消す（ADR-011 の起動時クリーンアップ）
      try {
        const { repaired, failed } = ensureComManifests(db, workspaceRoots)
        if (repaired.length > 0) console.warn('[main] マニフェストを書き直した', repaired)
        if (failed.length > 0) console.error('[main] マニフェストを書けなかった', failed)
      } catch (e) {
        console.error('[main] マニフェストをそろえられなかった', e)
      }
      purgeTrash()
    })
    .catch((e) => console.error('[main] DB の準備に失敗', e))

  // 設定（F14）。壊れていたら既定値で起動し、問題は settings:get と settings:changed で Renderer に伝える
  const store = SettingsStore.open(userData, (snapshot) =>
    mainWindow?.webContents.send(channelNames.settingsChanged, snapshot)
  )
  settingsStore = store
  const problem = store.get().problem
  if (problem) console.warn('[main] settings.json に問題があった', problem)

  const handle = createIpc(ipcMain, (event) =>
    isFromAppMainFrame(event, mainWindow?.webContents, (url) => isAppUrl(url, getAppUrl()))
  )
  handle(settingsGet, () => store.get())
  handle(settingsUpdate, (patch) => store.update(patch))

  // Workspace（F01）。DB の準備が終わってから答える。準備に失敗していたら unavailable で返す
  const getDatabase = async (): Promise<DatabaseSync> => {
    const db = await databaseReady.catch(() => undefined)
    if (!db || !db.isOpen) throw new IpcHandlerError('unavailable', 'DB を使えない')
    return db
  }
  const createWorkspace = createWorkspaceFlow(prepareWorkspaceFiles(workspaceRoots))
  handle(workspaceList, async () => {
    const db = await getDatabase()
    return { workspaces: listWorkspaces(db), currentId: getCurrentWorkspaceId(db) }
  })
  handle(workspaceCreate, async (input) => {
    const created = await createWorkspace(await getDatabase(), input)
    purgeTrash() // 作成で片付け用の場所へ移したフォルダを、トランザクションの外で消す
    return created
  })
  handle(workspaceSwitch, async ({ id }) => {
    const db = await getDatabase()
    try {
      return switchWorkspace(db, id)
    } catch (e) {
      if (e instanceof WorkspaceNotFoundError) throw new IpcHandlerError('not-found', e.message)
      throw e
    }
  })

  // タブ（F02）。ない Workspace・タブは not-found で返す
  const tabs = new TabFlows()
  const notFoundAs = <T>(fn: () => T): T => {
    try {
      return fn()
    } catch (e) {
      if (e instanceof TabNotFoundError) throw new IpcHandlerError('not-found', e.message)
      throw e
    }
  }
  const getWorkspaceDatabase = async (workspaceId: number): Promise<DatabaseSync> => {
    const db = await getDatabase()
    if (!getWorkspace(db, workspaceId)) {
      throw new IpcHandlerError('not-found', `Workspace ${workspaceId} がない`)
    }
    return db
  }
  handle(tabList, async ({ workspaceId }) =>
    getTabState(await getWorkspaceDatabase(workspaceId), workspaceId)
  )
  handle(tabCreate, async ({ workspaceId }) =>
    tabs.create(await getWorkspaceDatabase(workspaceId), workspaceId)
  )
  handle(tabClose, async ({ id }) => {
    const db = await getDatabase()
    return notFoundAs(() => tabs.close(db, id))
  })
  handle(
    tabReopenClosed,
    async ({ workspaceId }) =>
      tabs.reopenClosed(await getWorkspaceDatabase(workspaceId), workspaceId) ?? null
  )
  handle(tabActivate, async ({ id }) => {
    const db = await getDatabase()
    return notFoundAs(() => tabs.activate(db, id))
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 終了は止めない（止めると、あとの app.quit() が効かずに終了できなくなる）
app.on('will-quit', () => {
  quitting = true
  settingsStore?.close()
  database?.close()
  database = undefined
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
