# Workspace Git連携

Workspace CardでのGitステータス表示（[Design System](../design-system/ui-design-system-v1.1.md) 参照）を支える技術仕様。**読み取り専用**。コミット/ステージ/pushなどの書き込み操作は対象外。

## スキーマ追加

Workspace Manifestへの追加フィールドは [データスキーマ](./data-schema.md) を参照。

## 実装方針

システムにインストール済みの `git` CLIを `child_process` 経由で呼び出す（`git status --porcelain`, `git diff`, `git rev-parse --abbrev-ref HEAD`）。`isomorphic-git` 等のJS実装を自前で持たない——対象ユーザーはほぼ確実にgitをインストール済みであり、実装・保守コストの節約になる（Chromiumをフォークしない判断と同型の再利用ロジック）。

## Tier分類

`git status` / `git diff` はファイルシステムの読み取りのみで副作用がないため **Tier A**（常に自動、同意不要）。

**権限境界**：この機能はMain Processのネイティブ機能としてのみ実装し、Plugin（Worker Thread）には公開しない。Pluginはファイルシステムアクセスを構造的に持たないため、Git連携もこの境界の外側に置く。

## IPC

チャンネルは [IPC仕様: Workspace Git連携用チャンネル](./ipc-spec.md#workspace-git連携用チャンネル) を参照。

## 更新タイミング

Workspaceアクティブ化時に1回取得し、以降は `.git` ディレクトリへのファイルシステム監視（`fs.watch`）でイベント駆動更新する。ポーリングは行わない（性能予算・Zero Noiseの両立）。
