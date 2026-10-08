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
| `workspace.id` | `AUTOINCREMENT`（削除後も同じ番号を使い回さない） | パーティション `persist:workspace-<id>` とダウンロードフォルダが id に紐付くため。ただしこれは念のための対策で、本筋は「削除のときにパーティションのデータも消す」（下の「Workspace の削除」） |
| 時刻 | UTC の Unix 時刻（ミリ秒）を `INTEGER` で持つ。列名は `*_time_ms` | SPEC 6章・ADR-012 に合わせる。比較と計算が数値だけで済む |
| 種類 | `TEXT` と `CHECK (… IN (…))`。値は小文字の英語。値を増やすときはマイグレーションで行う | 不正な値を DB 自身が拒否する |
| 型の厳しさ | すべて `STRICT` テーブル | 型の誤りを書き込み時に見つける（損失なく数値にできる文字列 `'1'` などは、SQLite の仕様で受け入れられる） |
| 外部キー | 接続ごとに `PRAGMA foreign_keys = ON`。Workspace の持ち物は `ON DELETE CASCADE` | Workspace を消したら、タブ・履歴などが残らない |
| 接続の設定 | `journal_mode = WAL`、`synchronous = NORMAL` | 書き込み中のクラッシュに強く、速い |
| 命名 | SQLite は snake_case、TypeScript は camelCase。変換は `app/src/main/db/` の中だけで行う | CLAUDE.md |
| 秘密情報 | パスワード、Cookie の値、API キー、トークンは、どの列にも入れない（JSON の列も同じ） | SPEC 6章（個人情報）、パスワードは保存しない方針 |

### テーブル

下の SQL は、いつも最新のスキーマを表す（版を上げたら、ここも直す）。`app/src/main/db/migrations/schema.test.ts` が、すべてのマイグレーションを適用した DB と、この SQL を実行した DB の構造（テーブル・索引・トリガーの定義と列）を比べる。

<!-- latest-schema -->
```sql
-- Workspace（F01）。status・last_used_time_ms・dormanted_time_ms は ADR-012 の定義のとおり
CREATE TABLE workspace (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL CHECK (name = trim(name) AND length(name) BETWEEN 1 AND 100),
  mode              TEXT    NOT NULL CHECK (mode IN ('production', 'development', 'testing', 'custom')),
  status            TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dormant')),
  position          INTEGER NOT NULL,  -- 左パネルの並び順（Ctrl/Alt+1〜9）
  last_used_time_ms INTEGER NOT NULL,  -- 作成時は created_time_ms と同じ値
  dormanted_time_ms INTEGER,           -- dormant のときだけ値がある
  created_time_ms   INTEGER NOT NULL,
  CHECK ((status = 'dormant') = (dormanted_time_ms IS NOT NULL))
) STRICT;

-- アプリ全体の状態（F11、F12）。いつも1行だけ。設定（settings.json）ではなく、アプリが書く状態
CREATE TABLE app_state (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  last_workspace_id   INTEGER REFERENCES workspace(id) ON DELETE SET NULL,  -- 前回最後に開いていた Workspace
  last_quit_time_ms   INTEGER,                                             -- 前回の正常な終了の時刻（Developer Home の判定）
  clean_exit          INTEGER NOT NULL DEFAULT 1 CHECK (clean_exit IN (0, 1))  -- 起動時に 0、正常な終了で 1。起動時に 0 なら異常終了
) STRICT;

-- タブ（F02、F11、F15、F17）。選択中のタブは last_active_time_ms が最大のもの
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

-- 閲覧履歴（F09、F10）。URL ごとに1行（history_url）と、訪問1回ごとに1行（history_visit）に分ける
CREATE TABLE history_url (
  id                   INTEGER PRIMARY KEY,
  workspace_id         INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  url                  TEXT    NOT NULL,
  title                TEXT    NOT NULL DEFAULT '',  -- 最後に訪問したときの題名
  visit_count          INTEGER NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
  last_visited_time_ms INTEGER NOT NULL,
  UNIQUE (workspace_id, url)
) STRICT;
CREATE INDEX history_url_workspace_last ON history_url(workspace_id, last_visited_time_ms);
CREATE INDEX history_url_last ON history_url(last_visited_time_ms);

CREATE TABLE history_visit (
  id              INTEGER PRIMARY KEY,
  url_id          INTEGER NOT NULL REFERENCES history_url(id) ON DELETE CASCADE,
  visited_time_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX history_visit_url ON history_visit(url_id);
CREATE INDEX history_visit_visited ON history_visit(visited_time_ms);  -- 保存期間・期間指定の削除用

-- 履歴の全文検索（統合検索欄の 16ms）。trigram なので日本語の部分一致にも使える
CREATE VIRTUAL TABLE history_url_fts USING fts5(title, url, content='history_url', content_rowid='id', tokenize='trigram');
CREATE TRIGGER history_url_ai AFTER INSERT ON history_url BEGIN
  INSERT INTO history_url_fts(rowid, title, url) VALUES (new.id, new.title, new.url);
END;
CREATE TRIGGER history_url_ad AFTER DELETE ON history_url BEGIN
  INSERT INTO history_url_fts(history_url_fts, rowid, title, url) VALUES ('delete', old.id, old.title, old.url);
END;
CREATE TRIGGER history_url_au AFTER UPDATE OF title, url ON history_url BEGIN
  INSERT INTO history_url_fts(history_url_fts, rowid, title, url) VALUES ('delete', old.id, old.title, old.url);
  INSERT INTO history_url_fts(rowid, title, url) VALUES (new.id, new.title, new.url);
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
-- 親はフォルダだけ。種類（kind）は作った後に変えない
CREATE TRIGGER bookmark_parent_is_folder_insert BEFORE INSERT ON bookmark
  WHEN new.parent_id IS NOT NULL AND (SELECT kind FROM bookmark WHERE id = new.parent_id) IS NOT 'folder'
BEGIN
  SELECT RAISE(ABORT, 'bookmark parent must be a folder');
END;
CREATE TRIGGER bookmark_parent_is_folder_update BEFORE UPDATE OF parent_id ON bookmark
  WHEN new.parent_id IS NOT NULL AND (SELECT kind FROM bookmark WHERE id = new.parent_id) IS NOT 'folder'
BEGIN
  SELECT RAISE(ABORT, 'bookmark parent must be a folder');
END;
CREATE TRIGGER bookmark_kind_immutable BEFORE UPDATE OF kind ON bookmark WHEN new.kind IS NOT old.kind
BEGIN
  SELECT RAISE(ABORT, 'bookmark kind cannot change');
END;
CREATE VIRTUAL TABLE bookmark_fts USING fts5(title, url, content='bookmark', content_rowid='id', tokenize='trigram');
CREATE TRIGGER bookmark_ai AFTER INSERT ON bookmark WHEN new.kind = 'url' BEGIN
  INSERT INTO bookmark_fts(rowid, title, url) VALUES (new.id, new.title, new.url);
END;
CREATE TRIGGER bookmark_ad AFTER DELETE ON bookmark WHEN old.kind = 'url' BEGIN
  INSERT INTO bookmark_fts(bookmark_fts, rowid, title, url) VALUES ('delete', old.id, old.title, old.url);
END;
CREATE TRIGGER bookmark_au AFTER UPDATE OF title, url ON bookmark WHEN old.kind = 'url' BEGIN
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
  permission      TEXT    NOT NULL CHECK (permission IN (
                    'camera', 'microphone', 'notifications', 'geolocation',
                    'clipboard-read', 'display-capture', 'midi', 'idle-detection')),
  decision        TEXT    NOT NULL CHECK (decision IN ('allow', 'deny')),
  decided_time_ms INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, origin, permission)
) STRICT;

-- マニフェストの写しとチェックサム（ADR-012 の 5）。Workspace ごとに最新の1件だけ
CREATE TABLE workspace_manifest_backup (
  workspace_id    INTEGER NOT NULL PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  manifest_json   TEXT    NOT NULL,  -- USER 側の json の中身そのもの（ADR-013）
  sha256          TEXT    NOT NULL CHECK (length(sha256) = 64),  -- manifest_json の SHA256（16進）
  updated_time_ms INTEGER NOT NULL
) STRICT;

-- 削除前の自動スナップショット（F01）。削除後も残すため、workspace への外部キーを持たない
CREATE TABLE workspace_snapshot (
  id              INTEGER PRIMARY KEY,
  workspace_id    INTEGER NOT NULL,  -- 削除された Workspace の id（参照先はもうない）
  snapshot_json   TEXT    NOT NULL,  -- workspace の行・タブ・USER 側の json をまとめた JSON
  created_time_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX workspace_snapshot_created ON workspace_snapshot(created_time_ms);
```

### テーブルの関係

```
workspace ─┬─< tab
           ├─< history_url ─< history_visit
           │        └── history_url_fts（全文検索の索引）
           ├─< download
           ├─< site_permission
           ├─< extension_scope_workspace >── extension_scope
           ├── workspace_manifest_backup（1対1）
           └── app_state.last_workspace_id（消すと NULL）
bookmark ─< bookmark（フォルダの入れ子） ── bookmark_fts
workspace_snapshot（外部キーなし。削除された Workspace の控え）
```
`─<` は「1対多」。Workspace を消すと、`bookmark`・`extension_scope`・`workspace_snapshot` 以外の、その Workspace の行がまとめて消える。

### 設計の判断
| 論点 | 決定 | 理由 |
|---|---|---|
| ブックマークを Workspace ごとに分けるか | 分けない（全 Workspace で共有） | SPEC 6章の列に workspace_id がない。Chrome からの取り込みは1回で済ませたい。統合検索欄では「今の Workspace の候補」の中に出す |
| 拡張の適用範囲（SPEC の `workspace_ids`） | 1列のリストではなく、`extension_scope_workspace` に分ける | Workspace を消したときに、外部キーで自動的に消える。「この Workspace で有効な拡張」を索引で引ける |
| 履歴の持ち方 | URL ごとの `history_url` と、訪問ごとの `history_visit` に分ける（Chrome の urls と visits と同じ形） | 候補は URL ごとに1つ出すので、検索の対象を URL の表に絞れる。同じ URL を何度訪問しても行が増えない |
| 履歴の検索（16ms） | 3文字以上: `history_url_fts`（trigram）で、あとから作られた URL から最大200件を取り（`ORDER BY rowid DESC`。取りこぼしがあるのは、古い URL を最近訪れ直したとき）、その中を最終訪問の新しい順に並べて上位を出す。2文字以下: 新しい 5,000 件の URL だけを `LIKE` で見る | 10万件で測った（2026-09-28、手元の Node 22）。3文字以上は、よくある語でも 0.2ms（最大 0.5ms）。2文字以下は、全件を見ると 30ms かかったが、5,000 件に絞ると 2.8ms（最大 4.1ms）。T4-1 で、同じ条件のベンチを受け入れ条件にする |
| 選択中のタブ | 列を持たず、`last_active_time_ms` が最大のタブとする | 「選択中」を別に持つと、2つの値がずれうる（ADR-012 の「状態を書き換えない」と同じ考え） |
| 閉じたタブを戻す（Cmd/Ctrl+Shift+T） | DB に持たない（メモリだけ） | 再起動をまたぐ必要がない |
| 前回の終了時刻と異常終了のしるし（F11、F12） | `app_state`（1行だけの表）に持つ | `settings.json` は人が編集する設定なので、アプリが書く状態は置かない |
| ブックマークの親 | 親はフォルダだけ、種類は変えない（トリガーで拒否） | 全文検索の索引が種類の変更に追従できない問題を、変更自体を禁じて防ぐ。親子の循環はアプリ側（移動の処理）で防ぐ |
| ダウンロードの一時停止と再開 | 起動している間だけ再開できる。起動時に `in_progress`・`paused` の行は `interrupted` に直す | 再起動をまたいで再開するには、Electron の `createInterruptedDownload` 用の情報（ETag など）が要り、MVP では持たない |
| ダウンロードの大きさが不明 | `total_bytes` を NULL にする | Electron は不明のとき 0 を返すが、「0 バイト」と区別するため（ADR-012 の `dormanted_time_ms` と同じ考え） |
| サイトの権限の名前 | Electron の `media` は `camera` と `microphone` に分けて保存する。値は CHECK で限る | SPEC F16 はカメラとマイクを別々に記憶する。Electron は `media` 1つにまとめてしまう |
| バックアップ（ADR-012 の未決事項） | Workspace ごとに最新の1件だけ（上書き）。写すのは USER 側の json（COM 側は `{ id }` だけで、id から作り直せる） | 古い世代は、起動時の DB ファイル全体のバックアップ（下）が持つ |
| ADR-012 のパターン①（json が読めない）で id を得る方法 | Workspace のファイルは id を名前に含むフォルダに置き、フォルダ名から id を得る（下の「Workspace のフォルダ」） | 壊れた json からは id を読めないため |
| チェックサムの検証の時期（ADR-012 の未決事項） | 復元する前に検証する | 壊れた写しで上書きしないため |
| 削除前のスナップショット | 30日で消す（起動時） | Archive の境界（30日）に合わせる。ディスクを使い続けないため |
| 設定 | DB に持たない（`settings.json`） | SPEC F14（手で編集しても反映される） |

### Workspace のフォルダ（T2-1c、2026-09-28）
```
<userData>/
├── trueful.db
└── workspaces/
    ├── <id>/
    │   ├── com.json         COM 側のマニフェスト {"id": <id>}（ADR-013）
    │   └── workspace.json   USER 側の json（Phase 2。名前だけ予約）
    └── .trash/              片付け用（中身は後で消す）
<sessionData>/                既定では userData と同じ場所
└── Partitions/
    ├── workspace-<id>/      パーティション persist:workspace-<id>（Electron が作る）
    └── .trash/              片付け用（中身は後で消す）
```
- 作るとき（行を足すのと同じトランザクションの中）: 同じ id の `Partitions/workspace-<id>` と `workspaces/<id>` が残っていたら、それぞれの `.trash` へ移して空から始める（前の Workspace のログインやファイルを引き継がない）。そのあとで `com.json` を書く（ADR-014 の tmp → rename）。移すだけにするのは、中身が大きくても Main を止めないため。`.trash` の中身は、作成のあとと起動時に、トランザクションの外で消す（消せなければ次の起動でもう一度）。
- 準備に失敗したら、行を取り消し、その id は使い終わったことにする（`sqlite_sequence` を進める）。取り消すと次も同じ id になり、同じ残りに当たって作れなくなり続けるため。
- 起動時: DB にある Workspace の `com.json` がない・壊れている・id が合わないときは書き直す（中身は id だけなので、DB から作り直せる）。
- USER 側の json は MVP では作らない。名前・Mode・タブなどは、すべて DB が正（ADR-013）で、MVP では json に書き出す中身がないため。Git 連携・エクスポート（Phase 2）で中身を決めるときに、新しいファイルとして足す（既にある `com.json` の形は変えない）。`workspace_manifest_backup` は、そのときから使う。
- 後から壊さないための約束（マニフェストを読む側）: 知らない項目は無視する。`schemaVersion` がないものは版 1 として扱う（形を変える必要が出たときにだけ `schemaVersion` を足す）。知っている版より新しい `schemaVersion` のものは、読めなくても書き直さない（古い版のアプリで起動しても、新しい版の項目を消さない）。

### Workspace の削除（F01）
1. `workspace_snapshot` に控えを書く（名前・Mode・タブの URL とタイトルだけ）。
2. `workspace` の行を消す（関係する行は外部キーで消える）。1 と 2 は同じトランザクション。今の Workspace を消したら、残りのうち最後に使ったものへ移る。
3. ページ（WebContentsView）を破棄し、パーティション `persist:workspace-<id>` のデータを消す（`session.clearStorageData()` と、保存場所のフォルダを片付け用の場所へ移してから削除）。拡張の service worker は `clearStorageData()` だけでは消えないので、フォルダごと消す（T0-5 の追加調査）。フォルダを移せないとき（Windows でセッションが掴んでいる: EBUSY・EPERM）は、250ms 待って最大 4 回やり直す。それでも移せなかったフォルダは残り、警告を記録する（起動時の片付けが消すのは片付け用の場所の中だけ。DB にない id のフォルダを起動時に掃除するかは、るりあの判断待ち）。
- 順番を「DB が先、データは後」にしたのは、データを先に消して DB の削除が失敗すると、行だけが残る（ログインが消えた Workspace ができる）ため（T2-5c、2026-09-29）。
- Workspace を作るときに、同じ id のパーティションのフォルダが残っていたら、先に消す（DB をバックアップから戻したときに、番号が使い回されるため）。

### マイグレーション
- 版は `PRAGMA user_version` に記録する（0 は空の DB）。上の DDL が版 1。版 1 のマイグレーションは、DDL の後で `app_state` に1行（`id = 1`）を入れる。コードは `app/src/main/db/migrations/0001_initial.ts`。
- 起動時に、今の版より新しいマイグレーションを、番号順に1つずつ適用する。1つのマイグレーションは1つのトランザクションで、最後に `user_version` を上げる。途中で失敗したら、その版の変更はすべて取り消される。
- 表を作り直す種類のマイグレーション（列の型や制約を変える）は、トランザクションの外で `PRAGMA foreign_keys = OFF` にしてから行い、終わったら `PRAGMA foreign_key_check` で問題がないことを確かめてから `ON` に戻す（`foreign_keys` はトランザクションの中では変えられない）。
- DB の版がアプリより新しい（古いアプリで開いた）ときは、DB に触らずにエラーを表示する。
- 前の版に戻すマイグレーション（down）は作らない。戻したいときは、下のバックアップから戻す。

### 起動時の手順とバックアップ（SPEC 6章、ADR-012）
0. 同じ保存場所で、もう Trueful が動いていたら、何もせずに終わる（`requestSingleInstanceLock`。DB には触れない）。
1. DB を開き、`PRAGMA quick_check` で壊れていないか確かめる。
2. 壊れていたら、`trueful.db`・`trueful.db-wal`・`trueful.db-shm` を `trueful.db.broken-<時刻>`（と同じ接尾辞）に移し、`trueful.db.bak` から戻して、ユーザーに知らせる（F12、`db/flows/recoverDatabase.ts`）。バックアップがない・バックアップも壊れていたら、新しく作って知らせる（壊れたバックアップも `trueful.db.bak.broken-<時刻>` として残す）。WAL のファイルを残すと、戻した DB に古い変更が書き戻されるため、3つを一緒に移す。`trueful.db` がなく WAL・共有メモリだけ残っているとき（復元が途中で止まった後など）も、同じ名前で脇へよけてから開く（動かしたものがなければ、知らせに壊れたファイルの名前は出さない。バックアップがなければ、よけるだけで知らせない）。
3. 壊れていなければ、`sqlite.backup()` で DB 全体を一時ファイルに写し、`trueful.db.bak` に名前を変える（1世代、アトミック書き込み）。壊れた DB でバックアップを上書きしないため、必ず手順1の後に行う。
4. マイグレーションを適用する。
5. `app_state.clean_exit` を見て異常終了を判定し、0 にする（正常な終了で 1 に戻す）。

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
