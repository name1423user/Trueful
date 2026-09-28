import type { Migration } from '../services/migrate'

// 版1のスキーマ（作成時点の docs-ja/architecture/data-schema.md の SQL）。
// マージした後は書き換えない。変更は新しい版のマイグレーションで行い、
// すべての版を適用した結果が文書の「最新のスキーマ」と一致することを schema.test.ts で確かめる
export const SCHEMA_V1 = `
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
`

export const migration0001: Migration = {
  version: 1,
  up: (db) => {
    db.exec(SCHEMA_V1)
    // app_state はいつも1行だけ（data-schema.md）
    db.exec('INSERT INTO app_state (id) VALUES (1)')
  }
}
