import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { IpcResult } from '../main/ipc/channels'
import { channelNames } from '../main/ipc/channelNames'
import type { SettingsSnapshot } from '../main/settings/flows/settingsStore'
import type { Settings } from '../main/settings/services/settingsSchema'
import type { TabState } from '../main/tab/flows/tabFlows'
import type { TabListState } from '../main/tab/flows/tabPages'
import type { Tab } from '../main/tab/services/tabDB'
import type { PageState } from '../main/tab/services/tabViews'
import type { Bookmark } from '../main/bookmark/services/bookmarkDB'
import type { BookmarkImportOutcome } from '../main/ipc/bookmarkChannels'
import type { Download } from '../main/download/services/downloadDB'
import type { PermissionPrompt } from '../main/permission/flows/permissionPrompts'
import type { SitePermission } from '../main/permission/services/permissionDB'
import type { HistoryEntry } from '../main/history/services/historyDB'
import type { Workspace, WorkspaceMode } from '../main/workspace/services/workspaceDB'

// Main からの知らせを受け取る。event は渡さない（送り元の webContents などを Renderer に出さないため）
function subscribe<A extends unknown[]>(
  channel: string,
  listener: (...args: A) => void
): () => void {
  const wrapped = (_event: IpcRendererEvent, ...args: unknown[]): void => listener(...(args as A))
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

// Renderer に公開する API。用途別の関数だけを出し、ipcRenderer はそのまま渡さない（CLAUDE.md、SPEC 7章）。
// チャネルの定義と引数の検証は app/src/main/ipc/ にある。ここでは名前（channelNames）と型だけを使う
const api = {
  startup: {
    // 起動したときに決めた表示（restore: 前回の Workspace とタブ、developer-home: Workspace の一覧。F11、
    // crash: 異常終了の後なので、復元するかを聞く。F12）
    mode: (): Promise<IpcResult<'restore' | 'developer-home' | 'crash'>> =>
      ipcRenderer.invoke(channelNames.startupMode)
  },
  settings: {
    get: (): Promise<IpcResult<SettingsSnapshot>> => ipcRenderer.invoke(channelNames.settingsGet),
    update: (patch: Partial<Settings>): Promise<IpcResult<Settings>> =>
      ipcRenderer.invoke(channelNames.settingsUpdate, patch),
    // 変わったら知らせる（手で編集されたときも含む）。戻り値の関数で登録を外す
    onChanged: (listener: (snapshot: SettingsSnapshot) => void): (() => void) =>
      subscribe(channelNames.settingsChanged, listener)
  },
  workspace: {
    list: (): Promise<IpcResult<{ workspaces: Workspace[]; currentId: number | null }>> =>
      ipcRenderer.invoke(channelNames.workspaceList),
    // requestId は二度押しで2つ作らないための印（crypto.randomUUID() で作る）
    create: (input: {
      name: string
      mode: WorkspaceMode
      requestId: string
    }): Promise<IpcResult<Workspace>> => ipcRenderer.invoke(channelNames.workspaceCreate, input),
    switch: (id: number): Promise<IpcResult<Workspace>> =>
      ipcRenderer.invoke(channelNames.workspaceSwitch, { id }),
    // 削除する（ログインとサイトのデータも消える。確認は画面で済ませてから呼ぶ）
    delete: (id: number): Promise<IpcResult<{ currentId: number | null }>> =>
      ipcRenderer.invoke(channelNames.workspaceDelete, { id })
  },
  download: {
    list: (workspaceId?: number): Promise<IpcResult<Download[]>> =>
      ipcRenderer.invoke(
        channelNames.downloadList,
        workspaceId === undefined ? {} : { workspaceId }
      ),
    pause: (id: number): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(channelNames.downloadPause, { id }),
    resume: (id: number): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(channelNames.downloadResume, { id }),
    cancel: (id: number): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(channelNames.downloadCancel, { id }),
    showInFolder: (id: number): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(channelNames.downloadShowInFolder, { id }),
    // 進み具合・状態が変わったら知らせる。戻り値の関数で登録を外す
    onChanged: (listener: () => void): (() => void) =>
      subscribe(channelNames.downloadChanged, listener)
  },
  permission: {
    list: (workspaceId?: number): Promise<IpcResult<SitePermission[]>> =>
      ipcRenderer.invoke(
        channelNames.permissionList,
        workspaceId === undefined ? {} : { workspaceId }
      ),
    // 記憶した許可・拒否を取り消す（次に要求されたら、また確認する）
    revoke: (input: {
      workspaceId: number
      origin: string
      permission: SitePermission['permission']
    }): Promise<IpcResult<boolean>> => ipcRenderer.invoke(channelNames.permissionRevoke, input),
    // 答えを待っている確認（古い順）。増えた・減ったら onPromptsChanged で知らせる
    prompts: (): Promise<IpcResult<PermissionPrompt[]>> =>
      ipcRenderer.invoke(channelNames.permissionPrompts),
    // dismissed は「今は決めない」（拒否するが、記憶しない）
    answer: (id: number, answer: 'allow' | 'deny' | 'dismissed'): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(channelNames.permissionAnswer, { id, answer }),
    onPromptsChanged: (listener: () => void): (() => void) =>
      subscribe(channelNames.permissionPromptsChanged, listener)
  },
  history: {
    search: (input: {
      query: string
      workspaceId?: number
      limit?: number
    }): Promise<IpcResult<HistoryEntry[]>> => ipcRenderer.invoke(channelNames.historySearch, input),
    // 訪問の時刻（Unix ミリ秒）の範囲を消す。省略すると全部
    delete: (range: { fromMs?: number; toMs?: number }): Promise<IpcResult<{ removed: number }>> =>
      ipcRenderer.invoke(channelNames.historyDelete, range)
  },
  bookmark: {
    list: (): Promise<IpcResult<Bookmark[]>> => ipcRenderer.invoke(channelNames.bookmarkList),
    add: (
      input:
        | { kind: 'folder'; title: string; parentId?: number }
        | { kind: 'url'; title: string; url: string; parentId?: number }
    ): Promise<IpcResult<Bookmark>> => ipcRenderer.invoke(channelNames.bookmarkAdd, input),
    update: (input: { id: number; title?: string; url?: string }): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(channelNames.bookmarkUpdate, input),
    delete: (id: number): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(channelNames.bookmarkDelete, { id }),
    move: (id: number, parentId: number | null): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(channelNames.bookmarkMove, { id, parentId }),
    // Chrome のプロファイルから取り込む（場所は Main が探す）
    importChrome: (): Promise<IpcResult<BookmarkImportOutcome>> =>
      ipcRenderer.invoke(channelNames.bookmarkImportChrome),
    // Chrome の HTML エクスポートを、ファイル選択で選んで取り込む
    importHtml: (): Promise<IpcResult<BookmarkImportOutcome>> =>
      ipcRenderer.invoke(channelNames.bookmarkImportHtml)
  },
  tab: {
    list: (workspaceId: number): Promise<IpcResult<TabListState>> =>
      ipcRenderer.invoke(channelNames.tabList, { workspaceId }),
    create: (workspaceId: number): Promise<IpcResult<Tab>> =>
      ipcRenderer.invoke(channelNames.tabCreate, { workspaceId }),
    close: (workspaceId: number, id: number): Promise<IpcResult<TabState>> =>
      ipcRenderer.invoke(channelNames.tabClose, { workspaceId, id }),
    reopenClosed: (workspaceId: number): Promise<IpcResult<Tab | null>> =>
      ipcRenderer.invoke(channelNames.tabReopenClosed, { workspaceId }),
    activate: (workspaceId: number, id: number): Promise<IpcResult<Tab>> =>
      ipcRenderer.invoke(channelNames.tabActivate, { workspaceId, id }),
    navigate: (workspaceId: number, id: number, input: string): Promise<IpcResult<Tab>> =>
      ipcRenderer.invoke(channelNames.tabNavigate, { workspaceId, id, input }),
    control: (
      workspaceId: number,
      id: number,
      action: 'back' | 'forward' | 'reload' | 'stop'
    ): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(channelNames.tabControl, { workspaceId, id, action }),
    // タブ列が変わったら知らせる（ページが新しいタブを開いた・ショートカットなど）
    onListChanged: (listener: (workspaceId: number) => void): (() => void) =>
      subscribe(channelNames.tabListChanged, listener),
    // ページの様子が変わったら知らせる。戻り値の関数で登録を外す
    onPageChanged: (listener: (tabId: number, page: PageState) => void): (() => void) =>
      subscribe(channelNames.tabPageChanged, listener)
  },
  ui: {
    // メニューのショートカットのうち、画面で行うもの（アドレスバー・統合検索へのフォーカス、2段目の開閉）
    onCommand: (
      listener: (
        command: 'focus-address-bar' | 'focus-search' | 'toggle-side-panel' | 'bookmark-page'
      ) => void
    ): (() => void) => subscribe(channelNames.uiCommand, listener)
  },
  view: {
    // ページを表示する場所（空の div の getBoundingClientRect を整数にしたもの）
    setBounds: (bounds: {
      x: number
      y: number
      width: number
      height: number
    }): Promise<IpcResult<null>> => ipcRenderer.invoke(channelNames.viewSetBounds, bounds)
  }
}

contextBridge.exposeInMainWorld('trueful', api)

export type TruefulApi = typeof api
