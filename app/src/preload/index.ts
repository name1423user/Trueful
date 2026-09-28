import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { IpcResult } from '../main/ipc/channels'
import { channelNames } from '../main/ipc/channelNames'
import type { SettingsSnapshot } from '../main/settings/flows/settingsStore'
import type { Settings } from '../main/settings/services/settingsSchema'
import type { TabState } from '../main/tab/flows/tabFlows'
import type { Tab } from '../main/tab/services/tabDB'
import type { Workspace, WorkspaceMode } from '../main/workspace/services/workspaceDB'

// Renderer に公開する API。用途別の関数だけを出し、ipcRenderer はそのまま渡さない（CLAUDE.md、SPEC 7章）。
// チャネルの定義と引数の検証は app/src/main/ipc/ にある。ここでは名前（channelNames）と型だけを使う
const api = {
  settings: {
    get: (): Promise<IpcResult<SettingsSnapshot>> => ipcRenderer.invoke(channelNames.settingsGet),
    update: (patch: Partial<Settings>): Promise<IpcResult<Settings>> =>
      ipcRenderer.invoke(channelNames.settingsUpdate, patch),
    // 変わったら知らせる（手で編集されたときも含む）。戻り値の関数で登録を外す
    onChanged: (listener: (snapshot: SettingsSnapshot) => void): (() => void) => {
      const wrapped = (_event: IpcRendererEvent, snapshot: SettingsSnapshot): void =>
        listener(snapshot)
      ipcRenderer.on(channelNames.settingsChanged, wrapped)
      return () => ipcRenderer.removeListener(channelNames.settingsChanged, wrapped)
    }
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
      ipcRenderer.invoke(channelNames.workspaceSwitch, { id })
  },
  tab: {
    list: (workspaceId: number): Promise<IpcResult<TabState>> =>
      ipcRenderer.invoke(channelNames.tabList, { workspaceId }),
    create: (workspaceId: number): Promise<IpcResult<Tab>> =>
      ipcRenderer.invoke(channelNames.tabCreate, { workspaceId }),
    close: (workspaceId: number, id: number): Promise<IpcResult<TabState>> =>
      ipcRenderer.invoke(channelNames.tabClose, { workspaceId, id }),
    reopenClosed: (workspaceId: number): Promise<IpcResult<Tab | null>> =>
      ipcRenderer.invoke(channelNames.tabReopenClosed, { workspaceId }),
    activate: (workspaceId: number, id: number): Promise<IpcResult<Tab>> =>
      ipcRenderer.invoke(channelNames.tabActivate, { workspaceId, id })
  }
}

contextBridge.exposeInMainWorld('trueful', api)

export type TruefulApi = typeof api
