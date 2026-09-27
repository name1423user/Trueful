# Plugin Versioning

Pluginは自身のmanifestで対応するPlugin APIバージョンを宣言する（`apiVersion: 1`）。

- Main Processは直近2メジャーバージョン（N, N-1）のみサポート
- N-2以前のPluginは読み込み時に警告を出し無効化（黙って古いAPIで動かし続けない＝Predictable）
- 破壊的変更は必ずメジャーバージョンを上げる。マイナー/パッチ内での破壊的変更は禁止

## 設定優先順位との関係

Plugin由来の初期値はGlobalと同じ階層に位置づける（Workspace/Profile/CLIより弱い）。Pluginがユーザーの明示設定を上書きすることはない。

関連: [ADR-003: Worker Thread採用](./adr/adr-003-worker-thread.md)
