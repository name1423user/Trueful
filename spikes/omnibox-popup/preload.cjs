// 検索欄と候補一覧の両方で使う preload。ipcRenderer はそのまま出さず、必要な関数だけを渡す。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('spike', {
  input: (text) => ipcRenderer.send('spike:input', text),
  key: (name) => ipcRenderer.send('spike:key', name),
  pick: (index) => ipcRenderer.send('spike:pick', index),
  ack: (seq) => ipcRenderer.send('spike:ack', seq),
  onState: (cb) => ipcRenderer.on('spike:state', (_e, state) => cb(state)),
})
