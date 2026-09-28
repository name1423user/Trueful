# データスキーマ

## バージョニング

全スキーマに `schemaVersion`（number、初期値1）を持たせる。仕様変更時はMain Process側にマイグレーション関数を用意し、旧バージョンのWorkspace/Ledgerを自動変換する（Failure Friendly）。

## 共通スキーマ概要

| スキーマ | 役割 |
|---|---|
| Workspace Manifest | タブ・SecurityProfile・AI設定を含むプロジェクト定義。Git管理可能 |
| Security Profile | production/development/testing/custom。Tier C自動化フィールドは意図的に存在しない（設定可能にすること自体がリスク） |
| Inspector Agent Test Matrix | 検査ケース群。`sideEffectConfidence` と `tier(A/B/C)` を保持 |
| Pattern Trust Ledger | パターンごとの承認実績。新規パターンは常にC-onlyから開始。ローカル専用（可搬させない） |
| Inspector Bar State | 現在のSecurityProfile・AIステータス・待機件数(queueCount)・Cookie・reasonLog（Cookie/reasonLogはデフォルト非表示、タップで展開）。`aiContext.currentAction`（状態文字列）と `aiContext.queueCount`（数値）を別フィールドとして保持する |

## Workspace Manifest 追加フィールド（Git連携）

```json
"gitInfo": {
  "repoPath": "string | null",
  "enabled": "boolean"
}
```

`repoPath` が設定されていないWorkspace（コード以外の用途）ではGit表示自体を行わない。

## SQLite Schema

2026-09-28 に全面的に書き直した（るりあの依頼で Claude Code が設計した）。前の版（`workspace_id TEXT`、`created_at TEXT`、`pattern_trust_ledger`、`snapshot`）は、SPEC 6章・ADR-012・ADR-013 と食い違っていたため置き換えた。`pattern_trust_ledger` は AI 機能（MVP の範囲外）で必要になったときに、マイグレーションで追加する。

### 共通の約束

| 項目 | 決定 | 理由 |
|---|---|---|
| 実装 | `node:sqlite`（Electron 44 の Node 24.21 に組み込み） | ADR-002（2026-09-28 改訂）。T1-3a の比較 |
| ファイル | `userData/trueful.db`（1つ） | Main プロセスだけが1本の接続で使う。Renderer からは IPC 経由 |
| ID | `INTEGER PRIMARY KEY`（数値） | ADR-013 の `{ id: number }` に合わせる |
| `workspace.id` | `AUTOINCREMENT`（削除後も同じ番号を使い回さない） | パーティション `persist:workspace-<id>` とダウンロードフォルダが id に紐付くため。使い回すと、削除した Workspace の Cookie が新しい Workspace に見えてしまう |
| 時刻 | UTC の Unix 時刻（ミリ秒）を `INTEGER` で持つ。列名は `*_time_ms` | SPEC 6章・ADR-012 に合わせる。比較と計算が数値だけで済む |
| 真偽値・種類 | 種類は `TEXT` と `CHECK (… IN (…))`。値は小文字の英語 | 不正な値を DB 自身が拒否する |
| 型の厳しさ | すべて `STRICT` テーブル | SQLite の「何でも入る」を止め、型の誤りを書き込み時に見つける |
| 外部キー | 接続ごとに `PRAGMA foreign_keys = ON`。Workspace の持ち物は `ON DELETE CASCADE` | Workspace を消したら、タブ・履歴などが残らない |
| 接続の設定 | `journal_mode = WAL`、`synchronous = NORMAL` | 書き込み中のクラッシュに強く、速い |
| 命名 | SQLite は snake_case、TypeScript は camelCase。変換は `app/src/main/db/` の中だけで行う | CLAUDE.md |

### テーブル

```sql
-- Workspace（F01）。status・last_used_time_ms・dormanted_time_ms は ADR-012 の定義のとおり
CREATE TABLE workspace (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  mode              TEXT    NOT NULL CHECK (mode IN ('production', 'development', 'testing', 'custom')),
  status            TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dormant')),
  position          INTEGER NOT NULL,  -- 左パネルの並び順（Ctrl/Alt+1〜9）
  last_used_time_ms INTEGER NOT NULL,  -- 作成時は created_time_ms と同じ値
  dormanted_time_ms INTEGER,           -- dormant のときだけ値がある
  created_time_ms   INTEGER NOT NULL,
  CHECK ((status = 'dormant') = (dormanted_time_ms IS NOT NULL))
) STRICT;

-- タブ（F02、F11、F15）。選択中のタブは last_active_time_ms が最大のもの
CREATE TABLE tab (
  id                  INTEGER PRIMARY KEY,
  workspace_id        INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  url                 TEXT    NOT NULL,
  title               TEXT    NOT NULL DEFAULT '',
  position            INTEGER NOT NULL,
  scroll_y            INTEGER NOT NULL DEFAULT 0 CHECK (scroll_y >= 0),
  last_active_time_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX tab_workspace_position ON tab(workspace_id, position);

-- 閲覧履歴（F09、F10）。訪問1回を1行で持つ
CREATE TABLE history (
  id              INTEGER PRIMARY KEY,
  workspace_id    INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  url             TEXT    NOT NULL,
  title           TEXT    NOT NULL DEFAULT '',
  visited_time_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX history_workspace_visited ON history(workspace_id, visited_time_ms);
CREATE INDEX history_visited ON history(visited_time_ms);  -- 保存期間を過ぎた行の削除用

-- 履歴の全文検索（統合検索欄の 16ms）。trigram なので日本語の部分一致にも使える
CREATE VIRTUAL TABLE history_fts USING fts5(title, url, content='history', content_rowid='id', tokenize='trigram');
CREATE TRIGGER history_ai AFTER INSERT ON history BEGIN
  INSERT INTO history_fts(rowid, title, url) VALUES (new.id, new.title, new.url);
END;
CREATE TRIGGER history_ad AFTER DELETE ON history BEGIN
  INSERT INTO history_fts(history_fts, rowid, title, url) VALUES ('delete', old.id, old.title, old.url);
END;
CREATE TRIGGER history_au AFTER UPDATE ON history BEGIN
  INSERT INTO history_fts(history_fts, rowid, title, url) VALUES ('delete', old.id, old.title, old.url);
  INSERT INTO history_fts(rowid, title, url) VALUES (new.id, new.title, new.url);
END;

-- ブックマーク（F08）。全 Workspace で共有する。parent_id が NULL なら一番上
CREATE TABLE bookmark (
  id              INTEGER PRIMARY KEY,
  parent_id       INTEGER REFERENCES bookmark(id) ON DELETE CASCADE,
  kind            TEXT    NOT NULL CHECK (kind IN ('folder', 'url')),
  title           TEXT    NOT NULL DEFAULT '',
  url             TEXT,              -- フォルダは NULL、URL は必須
  position        INTEGER NOT NULL,  -- 同じフォルダの中での順番
  created_time_ms INTEGER NOT NULL,
  CHECK ((kind = 'folder') = (url IS NULL))
) STRICT;
CREATE INDEX bookmark_parent_position ON bookmark(parent_id, position);
CREATE VIRTUAL TABLE bookmark_fts USING fts5(title, url, content='bookmark', content_rowid='id', tokenize='trigram');
CREATE TRIGGER bookmark_ai AFTER INSERT ON bookmark WHEN new.kind = 'url' BEGIN
  INSERT INTO bookmark_fts(rowid, title, url) VALUES (new.id, new.title, new.url);
END;
CREATE TRIGGER bookmark_ad AFTER DELETE ON bookmark WHEN old.kind = 'url' BEGIN
  INSERT INTO bookmark_fts(bookmark_fts, rowid, title, url) VALUES ('delete', old.id, old.title, old.url);
END;
CREATE TRIGGER bookmark_au AFTER UPDATE ON bookmark WHEN old.kind = 'url' BEGIN
  INSERT INTO bookmark_fts(bookmark_fts, rowid, title, url) VALUES ('delete', old.id, old.title, old.url);
  INSERT INTO bookmark_fts(rowid, title, url) VALUES (new.id, new.title, new.url);
END;

-- ダウンロード（F07）。行を消しても、保存したファイルは消さない
CREATE TABLE download (
  id              INTEGER PRIMARY KEY,
  workspace_id    INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  url             TEXT    NOT NULL,
  path            TEXT    NOT NULL,  -- 保存先の絶対パス（連番を付けた後のもの）
  state           TEXT    NOT NULL CHECK (state IN ('in_progress', 'paused', 'completed', 'cancelled', 'interrupted')),
  received_bytes  INTEGER NOT NULL DEFAULT 0 CHECK (received_bytes >= 0),
  total_bytes     INTEGER CHECK (total_bytes >= 0),  -- 大きさが分からないときは NULL
  started_time_ms INTEGER NOT NULL,
  ended_time_ms   INTEGER
) STRICT;
CREATE INDEX download_workspace_started ON download(workspace_id, started_time_ms);

-- 拡張の適用範囲（F04）。scope = 'selected' のときだけ、extension_scope_workspace に行がある
CREATE TABLE extension_scope (
  extension_id TEXT NOT NULL PRIMARY KEY,
  scope        TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'selected'))
) STRICT;
CREATE TABLE extension_scope_workspace (
  extension_id TEXT    NOT NULL REFERENCES extension_scope(extension_id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  PRIMARY KEY (extension_id, workspace_id)
) STRICT;
CREATE INDEX extension_scope_workspace_workspace ON extension_scope_workspace(workspace_id);

-- サイトの権限（F16）。Workspace とサイトと権限の組ごとに1行
CREATE TABLE site_permission (
  workspace_id    INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  origin          TEXT    NOT NULL,  -- 例: https://meet.google.com
  permission      TEXT    NOT NULL,  -- Electron の権限名（media、notifications、geolocation など）
  decision        TEXT    NOT NULL CHECK (decision IN ('allow', 'deny')),
  decided_time_ms INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, origin, permission)
) STRICT;

-- マニフェストの写しとチェックサム（ADR-012 の 5）。Workspace ごとに最新の1件だけ
CREATE TABLE workspace_manifest_backup (
  workspace_id    INTEGER NOT NULL PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  manifest_json   TEXT    NOT NULL,
  sha256          TEXT    NOT NULL CHECK (length(sha256) = 64),  -- manifest_json の SHA256（16進）
  updated_time_ms INTEGER NOT NULL
) STRICT;

-- 削除前の自動スナップショット（F01）。削除後も残すため、workspace への外部キーを持たない
CREATE TABLE workspace_snapshot (
  id              INTEGER PRIMARY KEY,
  workspace_id    INTEGER NOT NULL,  -- 削除された Workspace の id（参照先はもうない）
  snapshot_json   TEXT    NOT NULL,  -- workspace の行・タブ・マニフェストをまとめた JSON
  created_time_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX workspace_snapshot_created ON workspace_snapshot(created_time_ms);
```

### テーブルの関係

```
workspace ─┬─< tab
           ├─< history ── history_fts（全文検索の索引）
           ├─< download
           ├─< site_permission
           ├─< extension_scope_workspace >── extension_scope
           └── workspace_manifest_backup（1対1）
bookmark ─< bookmark（フォルダの入れ子） ── bookmark_fts
workspace_snapshot（外部キーなし。削除された Workspace の控え）
```
`─<` は「1対多」。Workspace を消すと、`bookmark`・`extension_scope`・`workspace_snapshot` 以外の行がまとめて消える。

### 設計の判断
| 論点 | 決定 | 理由 |
|---|---|---|
| ブックマークを Workspace ごとに分けるか | 分けない（全 Workspace で共有） | SPEC 6章の列に workspace_id がない。Chrome からの取り込みは1回で済ませたい。統合検索欄では「今の Workspace の候補」の中に出す |
| 拡張の適用範囲（SPEC の `workspace_ids`） | 1列のリストではなく、`extension_scope_workspace` に分ける | Workspace を消したときに、外部キーで自動的に消える。「この Workspace で有効な拡張」を索引で引ける |
| 履歴の検索 | FTS5 の trigram（3文字ずつの索引） | 10万件で `LIKE '%…%'` は 16ms かかった（2026-09-28、手元で計測）。trigram なら 1ms 未満。2文字以下の入力は、索引を使わない検索に切り替える（T4-1 で実装） |
| 選択中のタブ | 列を持たず、`last_active_time_ms` が最大のタブとする | 「選択中」を別に持つと、2つの値がずれうる（ADR-012 の「状態を書き換えない」と同じ考え） |
| 閉じたタブを戻す（Cmd/Ctrl+Shift+T） | DB に持たない（メモリだけ） | 再起動をまたぐ必要がない |
| ダウンロードの大きさが不明 | `total_bytes` を NULL にする | Electron は不明のとき 0 を返すが、「0 バイト」と区別するため（ADR-012 の `dormanted_time_ms` と同じ考え） |
| バックアップ（ADR-012 の未決事項） | Workspace ごとに最新の1件だけ（上書き） | 古い世代は、起動時の DB ファイル全体のバックアップ（下）が持つ |
| チェックサムの検証の時期（ADR-012 の未決事項） | 復元する前に検証する | 壊れた写しで上書きしないため |
| 削除前のスナップショット | 30日で消す（起動時） | Archive の境界（30日）に合わせる。ディスクを使い続けないため |
| 設定 | DB に持たない（`settings.json`） | SPEC F14（手で編集しても反映される） |

### マイグレーション
- 版は `PRAGMA user_version` に記録する（0 は空の DB）。上の DDL が版 1。
- 起動時に、今の版より新しいマイグレーションを、番号順に1つずつ適用する。1つのマイグレーションは1つのトランザクションで、最後に `user_version` を上げる。途中で失敗したら、その版の変更はすべて取り消される。
- DB の版がアプリより新しい（古いアプリで開いた）ときは、DB に触らずにエラーを表示する。
- 前の版に戻すマイグレーション（down）は作らない。戻したいときは、下のバックアップから戻す。

### 起動時のバックアップ（SPEC 6章、ADR-012）
- マイグレーションの前に、`sqlite.backup()` で DB ファイル全体を `trueful.db.bak` に写す。1世代だけ残す。
- 書き込みは、一時ファイルに写してから名前を変える（CLAUDE.md のアトミック書き込み）。
- 起動時に `PRAGMA quick_check` で DB が壊れていると分かったら、壊れた DB を `trueful.db.broken-<時刻>` に移し、`trueful.db.bak` から戻して、ユーザーに知らせる（F12 で実装）。

## メモリ/データ共有モデル

| データ種別 | スコープ |
|---|---|
| Session / Cookie | Workspace単位（partition分離） |
| 認証情報（safeStorage） | Workspace単位（partitionに紐付け） |
| 閲覧履歴 | Workspace単位 |
| Pattern Trust Ledger | Origin単位でWorkspace間共有（Tier判定は同じProfile/allowlistゲートを通るため、共有してもゲート自体はバイパスされない） |
| AIモデル実体（Ollama） | アプリ全体で単一インスタンス共有（AI Brokerがworkspace文脈付きでキュー管理） |
| Plugin実行環境 | Worker Threadごとに独立、Workspace/他Pluginとデータ共有なし |

## インポート/エクスポート方針

| 形式 | 用途 |
|---|---|
| JSON | Workspace manifest本体。Git管理可能（既定） |
| Zip | Manifest＋Pattern Trust Ledger＋キャッシュ済みスナップショットの共有用バンドル。クレデンシャル（safeStorage管理分）は含めない |
| Git | JSON形式のManifestはそのままGit管理可能。専用ラッパーは不要 |
| クラウド同期 | Phase 3以降。実装時はAIのクラウド利用と同じ「明示的opt-in・サイレントフォールバック禁止」パターンを踏襲する |

関連: [IPC仕様](./ipc-spec.md) / [Workspace Git連携](./workspace-git-integration.md)
