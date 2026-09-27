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

```sql
CREATE TABLE workspace (
  workspace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  security_profile TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tab (
  tab_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  url TEXT NOT NULL,
  title TEXT,
  pinned INTEGER DEFAULT 0
);

CREATE TABLE history (
  entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  url TEXT NOT NULL,
  visited_at TEXT NOT NULL
);

CREATE TABLE pattern_trust_ledger (
  pattern_signature TEXT PRIMARY KEY,
  origin_id TEXT NOT NULL,
  approved_count INTEGER DEFAULT 0,
  anomaly_count INTEGER DEFAULT 0,
  tier_eligibility TEXT NOT NULL,
  last_verified_at TEXT,
  reverify_due_at TEXT
);

CREATE TABLE snapshot (
  snapshot_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  manifest_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

**マイグレーション戦略**：`workspace.schema_version` を起点に、Main Process起動時に現行バージョンとの差分を検出し、番号順にマイグレーション関数を逐次適用する（スキップ不可）。適用前に `snapshot` テーブルへ自動バックアップを1件作成する（Failure Friendly）。

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
