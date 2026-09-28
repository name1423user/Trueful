# ADR-002：SQLite（node:sqlite）採用

**ステータス**：決定済み（2026-09-28 改訂）

## 決定

Workspace・タブ・履歴などのローカル DB に SQLite を使い、実装は Node.js に組み込みの `node:sqlite`（`DatabaseSync`）を使う。Electron 44 の Main プロセス（Node 24.21）で動かす。

- DB に触るコードは `app/src/main/db/` に閉じ込め、ほかの場所から `node:sqlite` を直接使わない。
- テーブルの定義とマイグレーションの方針は [データスキーマ](../data-schema.md) に書く。

## 理由

- 組込み型でサーバー不要（Local First直結）。改訂前と同じ。
- 同期 API が、Electron の Main プロセスのシングルスレッドモデルと相性がよい。改訂前と同じ（`DatabaseSync` も同期 API）。
- T1-3a の比較（`spikes/sqlite-compare/RESULT.md`、2026-09-28）:
  - 速さは better-sqlite3 13.0.3 と実用上同じだった。挿入は Windows と Ubuntu で 2〜3 割速く、検索は同じくらい。
  - better-sqlite3 もビルド済みのバイナリを同梱していて、手間は変わらなかった。違いは、依存が1つ増えるかどうかと、安定度だった。
  - 依存の汚染を減らすため、依存がゼロの `node:sqlite` を選んだ（るりあの判断）。
- FTS5（trigram を含む）が使え、履歴の全文検索に使える（データスキーマ参照）。

## 引き受けるもの

- `node:sqlite` は Node 24.21 で Stability 1.2（Release candidate）。Electron を上げたときに API が小さく変わる可能性がある。
  - 対策: 使う API を `app/src/main/db/` の中だけに閉じ込める。Electron を上げる PR で、DB の単体テストが通ることを確かめる。
- SQLite の版は Electron（Node）の版と一緒に上がる。SQLite だけを先に上げることはできない。Electron は4週間以内に追従する方針（SPEC 11章）なので、SQLite の修正もその周期で入る。

## 補足

- history/manifest全体をsqlcipher等で暗号化することは行わない（詳細は [Threat Model](../../security/threat-model.md) 参照）。改訂前と同じ。

## 改訂履歴

- 2026-09-28：better-sqlite3 から `node:sqlite` に改訂（T1-3a の比較の結果、るりあの判断）。改訂前の決定は「Workspace/履歴/Pattern Trust LedgerのローカルDBに better-sqlite3 を採用する」。改訂前の理由の「Gantt Chart Studioで既に実績がある」は、better-sqlite3 に固有の理由だったので外した。

関連: [データスキーマ](../data-schema.md)
