import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import { existsSync, readdirSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { openOrRecoverDatabase, type DatabaseRecovery } from './db/flows/recoverDatabase'
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
import {
  downloadCancel,
  downloadList,
  downloadPause,
  downloadResume,
  downloadShowInFolder
} from './ipc/downloadChannels'
import { historyDelete, historySearch } from './ipc/historyChannels'
import {
  permissionAnswer,
  permissionList,
  permissionPrompts,
  permissionRevoke
} from './ipc/permissionChannels'
import {
  workspaceCreate,
  workspaceDelete,
  workspaceList,
  workspaceSwitch
} from './ipc/workspaceChannels'
import { chromeBookmarkFiles } from './bookmark/services/chromeBookmarks'
import { importFromFile } from './bookmark/flows/importFromFile'
import {
  deleteBookmark,
  insertBookmark,
  listBookmarks,
  moveBookmark,
  updateBookmark
} from './bookmark/services/bookmarkDB'
import { listPermissions, revokePermission } from './permission/services/permissionDB'
import { PermissionFlows } from './permission/flows/permissionFlows'
import { PermissionPrompts } from './permission/flows/permissionPrompts'
import { originOf } from './permission/services/permissionMap'
import { startupMode, startupNotices } from './ipc/startupChannels'
import {
  decideStartupMode,
  beginSession,
  recordCleanExit,
  type StartupMode
} from './startup/services/startupMode'
import { DownloadFlows } from './download/flows/downloadFlows'
import { interruptUnfinishedDownloads, listDownloads } from './download/services/downloadDB'
import { deleteHistory, purgeExpiredHistory, searchHistory } from './history/services/historyDB'
import { TabFlows, TabNotFoundError } from './tab/flows/tabFlows'
import { TabPages } from './tab/flows/tabPages'
import { TabViews } from './tab/services/tabViews'
import {
  createWorkspaceFlow,
  deleteWorkspaceFlow,
  switchWorkspace,
  WorkspaceNotFoundError
} from './workspace/flows/workspaceFlows'
import { purgeExpiredSnapshots } from './workspace/services/workspaceSnapshot'
import {
  cleanupDeletedWorkspaceFiles,
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
// 起動は1つだけ（同じ保存場所で2つ動くと、同じ DB に書き、異常終了の判定 clean_exit も壊れる。F12）。
// 2つ目は何もせずに終わり（DB にも触れない）、1つ目のウィンドウを前に出す
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  console.warn(
    '[main] 同じ保存場所で、もう Trueful が動いているので終わる',
    app.getPath('userData')
  )
  app.exit(0)
}
// ウィンドウがなければ（macOS でウィンドウを全部閉じた）作り直す。whenReady の中で決める
let reopenWindow = (): void => {}
app.on('second-instance', () => {
  const window = mainWindow
  if (!window || window.isDestroyed()) return reopenWindow()
  if (window.isMinimized()) window.restore()
  window.focus()
})
// E2E で、ページの実体の上限（F02 の 30 個）を小さくして確かめる。配布版では使わない
const maxPageViews = Number(process.env['TRUEFUL_MAX_PAGE_VIEWS'])
const pageViewLimit =
  !app.isPackaged && Number.isInteger(maxPageViews) && maxPageViews > 0 ? maxPageViews : undefined

// DB の接続。準備（非同期）の途中で終了が始まったら、準備が終わったところで閉じる
let database: DatabaseSync | undefined
let quitting = false
let settingsStore: SettingsStore | undefined
let downloadFlows: DownloadFlows | undefined
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
  // Windows で OS をシャットダウン・ログオフすると、will-quit が来ないので、ここで終了の時刻を記録する
  window.on('session-end', () => {
    if (database) recordQuit(database)
  })
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
  // app.exit が効く前に ready まで進んでも、2つ目は何もしない（DB・clean_exit に触れない）
  if (!gotSingleInstanceLock) return
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
  // 壊れていたら、壊れたファイルを残してバックアップから戻す（F12）。戻したことは画面で知らせる
  let databaseRecovery: DatabaseRecovery | undefined
  const databaseReady = openOrRecoverDatabase(userData).then(({ db, recovery }) => {
    databaseRecovery = recovery
    if (recovery) console.warn('[main] 壊れた DB を戻した', recovery)
    return db
  })
  databaseReady
    .then((db) => {
      if (quitting) {
        // 準備の途中で終了した。前回の記録を残さないよう、今の時刻で書いてから閉じる
        recordQuit(db)
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
      // 削除前のスナップショットのうち、30 日たったものを消す（data-schema.md）
      try {
        purgeExpiredSnapshots(db, Date.now())
      } catch (e) {
        console.error('[main] スナップショットの期限切れを消せなかった', e)
      }
      // 再起動の前に終わらなかったダウンロードは「中断」にする（F07）。最初のダウンロードが始まる前に、ここで1回だけ
      try {
        interruptUnfinishedDownloads(db, Date.now())
      } catch (e) {
        console.error('[main] ダウンロードの中断を記録できなかった', e)
      }
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
  // 起動のときに1回だけ決める（F11）。前回の正常な終了から「Developer Home までの時間」を超えていたら Developer Home。
  // 決められなかったら（DB の準備に失敗など）、復元にする
  const mode: Promise<StartupMode> = databaseReady
    .then((db) =>
      decideStartupMode(
        beginSession(db),
        getCurrentWorkspaceId(db) !== null,
        Date.now(),
        store.get().settings
      )
    )
    .catch(() => 'restore' as const)
  // Developer Home を出すのは、起動して最初の画面だけ。macOS でウィンドウを開き直したときは復元する
  let startupShown = false
  // 起動のときに知らせること（壊れた DB を戻した、など）。DB の準備を待ってから返す
  handle(startupNotices, async () => {
    await databaseReady.catch(() => undefined)
    // 知らせるのは1回だけ（ウィンドウを開き直したとき・再読み込みのときに、また出さない）
    const notices = databaseRecovery ? [databaseRecovery] : []
    databaseRecovery = undefined
    return notices
  })
  handle(startupMode, async () => {
    const m = await mode
    if (!startupShown) {
      startupShown = true
      return m
    }
    // 起動の画面を出す前にウィンドウを開き直した（macOS の activate）。Developer Home は出さずに復元する。
    // 起動のときにページを読み込んでいなければ、ここで読み込む
    if (m !== 'restore') showCurrent()
    return 'restore'
  })
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
  // ダウンロード（F07）。ページのダウンロードは、Workspace ごとのフォルダに保存する
  const downloads = new DownloadFlows({
    getDb: () => database,
    // E2E では、普段のダウンロードのフォルダを汚さないよう、環境変数で差し替える
    downloadsDir: process.env['TRUEFUL_DOWNLOADS_DIR'] ?? app.getPath('downloads'),
    notifyChanged: () => mainWindow?.webContents.send(channelNames.downloadChanged),
    showItemInFolder: (path) => shell.showItemInFolder(path)
  })
  downloadFlows = downloads
  // サイトの権限（F16）。決めていないものは、画面に確認を出して（T3-7b）、答えを記憶する
  const prompts = new PermissionPrompts(() =>
    mainWindow?.webContents.send(channelNames.permissionPromptsChanged)
  )
  const permissions = new PermissionFlows({
    getDb: () => database,
    ask: (workspaceId, origin, permission, signal, tabId) =>
      prompts.ask(workspaceId, origin, permission, signal, tabId)
  })
  const tabs = new TabFlows()
  const views = new TabViews(
    window,
    {
      onPageChanged: (tabId, page, committed) => {
        // 別のサイトへ移ったら、前のサイトの権限の確認を終える
        if (committed) prompts.tabNavigated(tabId, originOf(page.url))
        pages.pageChanged(tabId, page, committed)
      },
      onOpenRequest: (tabId, url, background) => pages.openRequested(tabId, url, background),
      onLoadError: () => mainWindow?.webContents.focus(),
      onDownload: (workspaceId, item) => downloads.handle(workspaceId, item),
      onPermissionRequest: (workspaceId, url, permission, details) =>
        permissions.request(workspaceId, url, permission, details),
      onPermissionCheck: (workspaceId, url, permission, details) =>
        permissions.check(workspaceId, url, permission, details),
      onReservedShortcut: (command) => runMenuCommand(command),
      onDiscarded: (tabIds) => pages.discarded(tabIds),
      onPageGone: (tabId) => prompts.dismissTab(tabId)
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
    // 2段目の開閉と、今のページのブックマーク追加は画面で行う（フォーカスは動かさない）
    if (command === 'toggle-side-panel' || command === 'bookmark-page') {
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
  // Developer Home・異常終了の確認を出すときは、ページを読み込まない（選んだら、切り替えで表示する）
  void mode.then((m) => {
    if (m === 'restore') showCurrent()
  })
  onWindowClosed = () => {
    views.destroyAll()
    // 確認を出す画面がなくなったので、待っている確認は答えなしにする
    prompts.dismissAll()
  }

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
  // 削除。DB（スナップショットと行）が先。成功したら、ページを破棄し、ログインとサイトのデータを消す
  handle(workspaceDelete, async ({ id }) => {
    const db = await getDatabase()
    let deleted: ReturnType<typeof deleteWorkspaceFlow>
    try {
      deleted = deleteWorkspaceFlow(db, id)
    } catch (e) {
      if (e instanceof WorkspaceNotFoundError) throw new IpcHandlerError('not-found', e.message)
      throw e
    }
    // 消した Workspace の確認は、答えなし（拒否して記憶しない）にする
    permissions.dismissWorkspace(id)
    for (const tabId of deleted.tabIds) views.destroy(tabId)
    if (deleted.currentId !== null) pages.showActive(db, deleted.currentId)
    releaseDormant(db)
    void cleanupDeletedWorkspaceFiles(workspaceRoots, id, async (workspaceId) => {
      const ses = session.fromPartition(`persist:workspace-${workspaceId}`)
      await ses.clearStorageData()
      await ses.clearCache()
      ses.flushStorageData() // フォルダを掴んでいる書き込みを済ませてから、移す
    }).then((errors) => {
      if (errors.length > 0)
        console.warn(`[main] 削除した Workspace ${id} のファイルを消せなかった`, errors)
    })
    return { currentId: deleted.currentId }
  })

  // ダウンロード（F07）
  handle(downloadList, async ({ workspaceId }) => listDownloads(await getDatabase(), workspaceId))
  handle(downloadPause, ({ id }) => downloads.pause(id))
  handle(downloadResume, ({ id }) => downloads.resume(id))
  handle(downloadCancel, ({ id }) => downloads.cancel(id))
  handle(downloadShowInFolder, ({ id }) => downloads.showInFolder(id))

  // サイトの権限（F16）
  handle(permissionList, async ({ workspaceId }) =>
    listPermissions(await getDatabase(), workspaceId)
  )
  handle(permissionRevoke, async ({ workspaceId, origin, permission }) =>
    revokePermission(await getDatabase(), workspaceId, origin, permission)
  )
  handle(permissionPrompts, () => prompts.list())
  handle(permissionAnswer, ({ id, answer }) => prompts.answer(id, answer))

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

  // ウィンドウを作り直すときは、起動の画面（Developer Home など）は出さない
  reopenWindow = () => {
    startupShown = true
    createWindow()
    views.attach(mainWindow!)
    showCurrent()
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return
    reopenWindow()
  })
})

// 正常な終了の時刻（次の起動で、Developer Home を出すか・異常終了だったかの判定に使う。F11・F12）
function recordQuit(db: DatabaseSync): void {
  try {
    if (db.isOpen) recordCleanExit(db, Date.now())
  } catch (e) {
    console.error('[main] 終了の時刻を記録できなかった', e)
  }
}

// 終了は止めない（止めると、あとの app.quit() が効かずに終了できなくなる）
app.on('will-quit', () => {
  quitting = true
  if (database) recordQuit(database)
  downloadFlows?.dispose()
  settingsStore?.close()
  database?.close()
  database = undefined
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
