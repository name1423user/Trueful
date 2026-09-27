# Event Bus（内部イベント）

IPCはRenderer↔Main間の通信だが、Main Process内部のモジュール間連携には別途イベントバス（Node.js EventEmitterベース）を用意する。

## 主要イベント

- `WorkspaceLoaded`
- `TabCreated`
- `SecurityChanged`
- `SnapshotCreated`
- `TierCaseExecuted`

## 目的

AI Broker・Inspector Bar・スナップショット機構が互いを直接参照せず疎結合になる（Extensible #15）。

関連: [IPC仕様](./ipc-spec.md)
