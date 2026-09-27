# ADR-004：Chromium固定（OSごとにエンジンを変えない）

**ステータス**：決定済み

## 決定

全OSでChromium（Electron経由）に統一し、Tauriのような OS-native WebView切替は採用しない。

## 理由

CDPベースのInspector Agent / Inspectable / Security Is a Choiceの一貫性を優先する。[ADR-001](./adr-001-electron.md) の直接的帰結。
