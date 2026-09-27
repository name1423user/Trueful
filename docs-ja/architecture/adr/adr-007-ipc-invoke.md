# ADR-007：IPCはinvoke型（request/response）を採用

**ステータス**：決定済み

## 決定

Renderer→Main通信は `ipcRenderer.invoke` ベースの1リクエスト1レスポンス型に統一し、fire-and-forgetの `send` は使わない。

## 理由

全操作の結果を確実に追跡できる（Transparency）。Main→Rendererのプッシュ通知は `webContents.send` で明確に区別し、双方向を混同しない（No Confusion）。

関連: [IPC仕様](../ipc-spec.md)
