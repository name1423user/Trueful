# ADR-001：実行基盤は Electron + Chromium

**ステータス**：決定済み

## 決定

Tauriではなく Electron を採用する。

## 検討した選択肢と判断根拠

| 選択肢 | 評価 |
|---|---|
| Electron（Chromium固定） | ○ 全OSでCDP・証明書処理・Inspector Agentの挙動が一貫。既存資産（Gantt Chart Studio）を再利用可 |
| Tauri（OS標準WebView） | ✕ Windows=WebView2(Chromium)、macOS/Linux=WebKit系に分岐。No Confusion違反。既存Electron資産はゼロから作り直し |
| Tauri + cef-rs | △ 全OSでChromium統一は可能だが、Tauriの最大の利点（軽量）を失い実質Electronに近づく。成熟度も発展途上 |

## 決め手

- 既存スタックの再利用（IPC設計・session partition・BrowserView管理の知識がそのまま使える）
- 将来クロスプラットフォーム展開時にWebKit分岐が発生しない保険
- 本ブラウザはWorkspaceを開きっぱなしで使う設計のため、Tauriの強み（起動速度・低RAM）の恩恵頻度が低い

## 再検討条件

Windows専用に完全に割り切り、かつRust自体を書く目的が別途あるならTauriも妥当。ただし本プロジェクトの目的（ブラウザの完成を最短で）には合致しない。

関連: [ADR-004: Chromium固定](./adr-004-chromium-fixed.md)
