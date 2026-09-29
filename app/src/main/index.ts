import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import { existsSync, readdirSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { initDatabase } from './db/flows/initDatabase'
import { channelNames } from './ipc/channelNames'
import { createIpc, isFromAppMainFrame } from './ipc/handle'
import { IpcHandlerError } from './ipc/channels'
import { settingsGet, settingsUpdate } from './ipc/settingsChannels'
import {
  tabActivate,
  tabClose,
  tabControl,
  tabCreate,
  tabList,
  tabNavigate,
  tabReopenClosed,
  viewSetBounds
} from './ipc/tabChannels'
import {
  bookmarkAdd,
  bookmarkDelete,
  bookmarkImportChrome,
  bookmarkImportHtml,
  bookmarkList,
  bookmarkMove,
  bookmarkUpdate
} from './ipc/bookmarkChannels'
import { historyDelete, historySearch } from './ipc/historyChannels'
import { workspaceCreate, workspaceList, workspaceSwitch } from './ipc/workspaceChannels'
import { chromeBookmarkFiles } from './bookmark/services/chromeBookmarks'
import { importFromFile } from './bookmark/flows/importFromFile'
import {
  deleteBookmark,
  insertBookmark,
  listBookmarks,
  moveBookmark,
  updateBookmark
} from './bookmark/services/bookmarkDB'
import { deleteHistory, purgeExpiredHistory, searchHistory } from './history/services/historyDB'
import { TabFlows, TabNotFoundError } from './tab/flows/tabFlows'
import { TabPages } from './tab/flows/tabPages'
import { TabViews } from './tab/services/tabViews'
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
import ja from '../renderer/src/locales/ja.json'
import { appMenuTemplate, type MenuCommand } from './window/services/appMenu'
import { isAppUrl } from './window/services/appUrl'
import { isExternalUrl } from './window/services/externalUrl'

// E2E などで、保存場所を普段の userData から切り替える。配布版では使わない
const userDataDir = process.env['TRUEFUL_USER_DATA_DIR']
if (!app.isPackaged && userDataDir) app.setPath('userData', userDataDir)
// E2E で、ページの実体の上限（F02 の 30 個）を小さくして確かめる。配布版では使わない
const maxPageViews = Number(process.env['TRUEFUL_MAX_PAGE_VIEWS'])
const pageViewLimit =
  !app.isPackaged && Number.isInteger(maxPageViews) && maxPageViews > 0 ? maxPageViews : undefined

// DB の接続。準備（非同期）の途中で終了が始まったら、準備が終わったところで閉じる
let database: DatabaseSync | undefined
let quitting = false
let settingsStore: SettingsStore | undefined
let mainWindow: BrowserWindow | undefined

// ウィンドウを閉じたときの片付け（タブのページの破棄。whenReady の中で設定する）
let onWindowClosed = (): void => {}

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
    onWindowClosed()
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
      // 保存期間（設定。既定 90 日）を過ぎた履歴を消す（F09）
      try {
        purgeExpiredHistory(db, Date.now(), store.get().settings.historyRetentionDays)
      } catch (e) {
        console.error('[main] 履歴の期限切れを消せなかった', e)
      }
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
  // ウィンドウと、タブのページの表示（ADR-008）。ページの様子とタブ列の変化は Renderer に知らせる
  createWindow()
  const window = mainWindow!
  const tabs = new TabFlows()
  const views = new TabViews(
    window,
    {
      onPageChanged: (tabId, page, committed) => pages.pageChanged(tabId, page, committed),
      onOpenRequest: (tabId, url, background) => pages.openRequested(tabId, url, background),
      onReservedShortcut: (command) => runMenuCommand(command),
      onDiscarded: (tabIds) => pages.discarded(tabIds)
    },
    pageViewLimit
  )
  const pages: TabPages = new TabPages(tabs, views, () => database, {
    page: (tabId, page) => mainWindow?.webContents.send(channelNames.tabPageChanged, tabId, page),
    tabsChanged: (workspaceId) =>
      mainWindow?.webContents.send(channelNames.tabListChanged, workspaceId)
  })
  // メニューのショートカット（F02・F10）。ページにフォーカスがあっても効く
  // macOS ではウィンドウを閉じてもメニューのキーが効くので、ウィンドウがないときは何もしない
  const runMenuCommand = (command: MenuCommand): void => {
    const target = mainWindow
    if (!target || target.isDestroyed()) return
    if (command === 'focus-address-bar' || command === 'focus-search') {
      target.webContents.focus()
      target.webContents.send(channelNames.uiCommand, command)
      return
    }
    // 2段目の開閉は画面で行う（フォーカスは動かさない）
    if (command === 'toggle-side-panel') {
      target.webContents.send(channelNames.uiCommand, command)
      return
    }
    if (command === 'page-devtools') {
      views.shownWebContents()?.toggleDevTools()
      return
    }
    const db = database
    if (!db?.isOpen) return
    const tabCommand = (
      {
        'tab-new': 'new',
        'tab-close': 'close',
        'tab-reopen': 'reopen',
        'page-reload': 'reload'
      } as const
    )[command]
    pages.command(db, tabCommand)
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(appMenuTemplate(process.platform, ja.menu, runMenuCommand))
  )
  // 起動したら・ウィンドウを開き直したら、今の Workspace の選択中のタブを表示する
  const showCurrent = (): void =>
    void databaseReady
      .then((db) => {
        const current = getCurrentWorkspaceId(db)
        if (current !== null && !quitting && db.isOpen) pages.showActive(db, current)
      })
      .catch((e) => console.error('[main] ページを表示できなかった', e))
  showCurrent()
  onWindowClosed = () => views.destroyAll()

  const createWorkspace = createWorkspaceFlow(prepareWorkspaceFiles(workspaceRoots))
  handle(workspaceList, async () => {
    const db = await getDatabase()
    return { workspaces: listWorkspaces(db), currentId: getCurrentWorkspaceId(db) }
  })
  // 休止した Workspace のページを破棄する（作成・切り替えの返事は待たせない）
  const releaseDormant = (db: DatabaseSync): void =>
    void pages.releaseDormant(db).catch((e) => console.error('[main] 休止のページの破棄に失敗', e))
  handle(workspaceCreate, async (input) => {
    const db = await getDatabase()
    const created = await createWorkspace(db, input)
    purgeTrash() // 作成で片付け用の場所へ移したフォルダを、トランザクションの外で消す
    pages.showActive(db, created.id)
    releaseDormant(db)
    return created
  })
  handle(workspaceSwitch, async ({ id }) => {
    const db = await getDatabase()
    try {
      const switched = switchWorkspace(db, id)
      pages.showActive(db, id)
      releaseDormant(db)
      return switched
    } catch (e) {
      if (e instanceof WorkspaceNotFoundError) throw new IpcHandlerError('not-found', e.message)
      throw e
    }
  })

  // 閲覧履歴（F09）
  handle(historySearch, async (input) => searchHistory(await getDatabase(), input))
  handle(historyDelete, async (range) => ({ removed: deleteHistory(await getDatabase(), range) }))

  // ブックマーク（F08）。ない id は not-found
  const notFoundIf = (found: boolean, id: number): null => {
    if (!found) throw new IpcHandlerError('not-found', `ブックマーク ${id} がない`)
    return null
  }
  // 親がない（外部キー）・親がフォルダでない（トリガー）・自分の中へは移せない、だけを not-found にする。
  // ほかの失敗（DB の混雑など）は、そのまま投げて internal にする
  const asParentError = (e: unknown): unknown =>
    e instanceof Error && /constraint|bookmark parent|自分の中|がない/i.test(e.message)
      ? new IpcHandlerError('not-found', e.message)
      : e
  handle(bookmarkList, async () => listBookmarks(await getDatabase()))
  handle(bookmarkAdd, async (input) => {
    const db = await getDatabase()
    try {
      return insertBookmark(db, input, Date.now())
    } catch (e) {
      throw asParentError(e)
    }
  })
  handle(bookmarkUpdate, async ({ id, ...patch }) =>
    notFoundIf(updateBookmark(await getDatabase(), id, patch), id)
  )
  handle(bookmarkDelete, async ({ id }) => notFoundIf(deleteBookmark(await getDatabase(), id), id))
  handle(bookmarkMove, async ({ id, parentId }) => {
    const db = await getDatabase()
    try {
      moveBookmark(db, id, parentId)
      return null
    } catch (e) {
      throw asParentError(e)
    }
  })
  // Chrome のプロファイルは、見つかった最初のもの（Default が先）から取り込む
  handle(bookmarkImportChrome, async () => {
    const db = await getDatabase()
    const [file] = chromeBookmarkFiles({
      platform: process.platform,
      home: app.getPath('home'),
      localAppData: process.env['LOCALAPPDATA'],
      exists: existsSync,
      listDir: (dir) => readdirSync(dir)
    })
    return file === undefined
      ? { status: 'not-found' as const }
      : importFromFile(db, file, 'chrome', Date.now())
  })
  // ダイアログを開いている間の2回目の呼び出しは、取りやめとして返す
  let choosingHtml = false
  handle(bookmarkImportHtml, async () => {
    const db = await getDatabase()
    if (choosingHtml) return { status: 'cancelled' as const }
    choosingHtml = true
    const options = {
      properties: ['openFile' as const],
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
    }
    let chosen: Awaited<ReturnType<typeof dialog.showOpenDialog>>
    try {
      chosen = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options)
    } finally {
      choosingHtml = false
    }
    const [file] = chosen.filePaths
    return chosen.canceled || file === undefined
      ? { status: 'cancelled' as const }
      : importFromFile(db, file, 'html', Date.now())
  })

  // タブ（F02）。ない Workspace・タブは not-found で返す。作成・閉じる・戻す・選ぶの後は、選択中のタブを表示する
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
    pages.list(await getWorkspaceDatabase(workspaceId), workspaceId)
  )
  const thenShow = <T>(db: DatabaseSync, workspaceId: number, value: T): T => {
    pages.showActive(db, workspaceId)
    return value
  }
  handle(tabCreate, async ({ workspaceId }) => {
    const db = await getWorkspaceDatabase(workspaceId)
    return thenShow(db, workspaceId, tabs.create(db, workspaceId))
  })
  handle(tabClose, async ({ workspaceId, id }) => {
    const db = await getWorkspaceDatabase(workspaceId)
    return notFoundAs(() => pages.close(db, workspaceId, id))
  })
  handle(tabReopenClosed, async ({ workspaceId }) => {
    const db = await getWorkspaceDatabase(workspaceId)
    return thenShow(db, workspaceId, tabs.reopenClosed(db, workspaceId) ?? null)
  })
  handle(tabActivate, async ({ workspaceId, id }) => {
    const db = await getWorkspaceDatabase(workspaceId)
    return thenShow(
      db,
      workspaceId,
      notFoundAs(() => tabs.activate(db, workspaceId, id))
    )
  })
  handle(tabNavigate, async ({ workspaceId, id, input }) => {
    const db = await getWorkspaceDatabase(workspaceId)
    const { shortcuts } = store.get().settings
    return notFoundAs(() => pages.navigate(db, workspaceId, id, input, shortcuts))
  })
  handle(tabControl, async ({ workspaceId, id, action }) => {
    const db = await getWorkspaceDatabase(workspaceId)
    notFoundAs(() => pages.control(db, workspaceId, id, action))
    return null
  })
  handle(viewSetBounds, (bounds) => {
    views.setBounds(bounds)
    return null
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return
    createWindow()
    views.attach(mainWindow!)
    showCurrent()
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
