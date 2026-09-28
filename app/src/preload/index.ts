import { contextBridge } from 'electron'

// Renderer に公開する API。用途別の関数だけを出し、ipcRenderer はそのまま渡さない（CLAUDE.md、SPEC 7章）。
// チャネル名と型は app/src/main/ipc/ で決め、ここでは型だけを使う（zod などを preload に持ち込まない）。
// 設定の API は T1-4-2 で足す
const api = {}

contextBridge.exposeInMainWorld('trueful', api)

export type TruefulApi = typeof api
