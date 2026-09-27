# ADR-003：Worker Thread採用（Plugin実行）

**ステータス**：決定済み

## 決定

PluginはBrowserView/iframeではなく Node.js Worker Thread で実行する。

## 理由

- ネットワーク・ファイルシステムアクセスを構造的に排除できる
- Chromiumレンダラーより軽量

## Plugin実行アーキテクチャ

BrowserView/iframeではなく Node.js Worker Thread（fetch・require・ファイルシステム・IPC直接アクセス一切なし）。`execute:network` はポリシーではなくアーキテクチャ上実行不可能。

**CSPについて**：PluginはBrowserView/Chromiumレンダラーを一切持たないため、Content Security Policyという概念自体が適用対象にならない。CSPはWebページ（Chromiumレンダラー内）にのみ関係し、Worker Thread上のPlugin実行環境には該当しない。

## 権限モデルとの関係

- ネットワーク不要、入出力がJSON往復のみのため、[便利ツール集](../../tools/command-palette-tools.md) の権限モデルと親和性が高い
- Git連携（読み取り専用）もこの境界の外側に置き、Pluginには公開しない

関連: [Plugin Versioning](../plugin-versioning.md) / [Threat Model](../../security/threat-model.md)
