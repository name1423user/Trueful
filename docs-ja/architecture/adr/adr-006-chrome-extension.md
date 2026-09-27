# ADR-006：Chrome拡張互換

**ステータス**：決定済み

## 決定

Electron組込みの `session.loadExtension`（electron-chrome-extensions）を使い、独自の互換レイヤーは開発しない。

## 理由

ゼロから互換層を作るのはTime First違反であり、Electron本体が既にMV2拡張を十分サポートしている。

## 既知の制約

2026年2月時点、Manifest V3（Service Worker背景スクリプトへのAPI注入）はElectron本体でまだ部分対応（`electron/electron#49984` は未解決）。Chrome Web Store拡張の多くは既にMV3へ移行済みのため、Phase 2時点では「主要な拡張の一部が動作しない」前提で計画する。

## Workspace分離

`ses.extensions.loadExtension` はセッション単位で行われる。Workspaceごとに独立した `persist:workspace-<id>` パーティションを持つ既存設計を活かし、拡張機能はWorkspaceごとに個別に `loadExtension` する。これによりIndexedDB等の拡張データもWorkspace間で分離される。

**コスト**：同一拡張でもWorkspace数だけ実体が複製されるためメモリ消費が増える。拡張は明示的に有効化したWorkspaceにのみロードし、全Workspace一律の自動ロードは行わない（Zero Noise）。

関連: [Roadmap: MVPスコープ](../../roadmap/mvp-scope.md)
