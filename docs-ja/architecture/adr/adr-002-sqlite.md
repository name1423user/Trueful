# ADR-002：SQLite（better-sqlite3）採用

**ステータス**：決定済み

## 決定

Workspace/履歴/Pattern Trust LedgerのローカルDBに better-sqlite3 を採用する。

## 理由

- 組込み型でサーバー不要（Local First直結）
- 同期APIがElectron Main Processのシングルスレッドモデルと相性がよい
- Gantt Chart Studioで既に実績がある

## 補足

- SQLite（better-sqlite3）はnpm依存関係の一部としてElectron更新サイクルに同梱される。独立した更新経路は持たない。
- history/manifest全体をsqlcipher等で暗号化することは行わない（詳細は [Threat Model](../../security/threat-model.md) 参照）。

関連: [データスキーマ](../data-schema.md)
