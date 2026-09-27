# INTERVIEW_STATE — Trueful 仕様再定義

- 開始: 2026-09-27 08:46 JST
- モード: フルモード / 既存アプリ（Trueful）の作り直し・仕様再定義
- 現在のフェーズ: 全フェーズ完了

## 前提（既存の状態）
- リポジトリの docs-ja を確認済み: mvp-scope.md（Phase1〜3、性能予算、ライフサイクル）、ADR-001〜014、threat-model 等
- 既存仕様: 哲学（4層・19原則）、Master Spec 36 Part、Design System、ADR群、Inspector Agent 3層モデル
- 既存実装: Electron + React + TypeScript + Vite + SQLite(better-sqlite3)。三ペイン骨格、Workspace型、アトミック書き込み。workspaceDB.ts 未着手
- 3人で共同開発（全員Git初心者、Mac/Windows、Discord）

## 競合メモ（フェーズ0）
- Polypane / Sizzy: 有料のマルチビューポート開発ブラウザ。Sizzyはワークスペース・端末・エージェントパネル統合
- Responsively: OSS（AGPL-3.0）、リリース間隔が空いている
- Arc: 保守モード（Dia に移行）。Zen: Firefoxフォーク、Arc的UIのOSS後継
- 差別化候補: 「ワークスペース管理 × 開発者の時間を奪わない」思想、OSS、AIエージェントの権限3層モデル

## 決定事項
- 作り直し（仕様再定義）でフルモード
- 作り直しの動機: 実装をClaude（Claude Code）に任せ、るりあは設計判断と監査に回る体制へ移行したい（08:48）
- 既存資産: 大半を引き継ぎ、差分だけ直す
- 利用者: OSSで不特定多数の開発者
- チームメンバー2人との共同開発はいったん保留（08:49）
- AI開示方針の変更は、新しいQiita番外編で方針転換を明示する
- MVP公開の期限は設けない
- MVPの成功基準: るりあ自身がメインブラウザにできる（08:50）
- MVP範囲外: アカウント・端末間同期、モバイル版、複数ビューポート同時表示
- 配布コスト: 0円（署名なし配布）。既存の code-signing.md の方針と一致
- macOSの更新: 更新通知＋手動ダウンロード（Windowsは NSIS で自動更新可）（08:51）
- 拡張機能: 複数必要 → ADR-006 の「Phase 2」から MVP へ前倒し（ADR-006 の改訂が必要）
- 成功基準: るりあが1か月、Trueful をメインブラウザとして使い続けられる
- フェーズ1 完了
- 必要な拡張: パスワード管理、広告ブロック、開発系（React DevTools等）、翻訳・その他（08:52）
- 1か月利用に必須の基本機能: Chromeからのブックマーク・パスワード移行、Google等のログイン維持、PDF閲覧、ダウンロード管理
- 広告ブロック: 内蔵型（@ghostery/adblocker-electron）（08:53）
- Googleログインが試作で通らなかった場合: 合格ラインを見直す
- パスワード移行: ChromeのCSVはパスワード管理アプリ側へ移す。Truefulはパスワード保存・自動入力を作らない（08:54）
- MVPで後回し: i18n（英語UI）のみ。オンボーディング、Tier Aツール集、Inspector Barは残す
- 拡張とWorkspaceの関係: 拡張ごとに「全Workspace共通」か「指定Workspaceのみ」を選べる（ADR-006改訂）
- 閲覧履歴: MVPに入れる。Command Paletteから検索（08:56）
- 起動時: 前回終了から一定時間（設定可能）以内なら前回のWorkspaceとタブを復元、超えたらDeveloper Home。Developer Homeを出さない設定も可能
- OSの既定ブラウザ設定: 後回し（外部アプリのリンクは当面Chrome等で開く）
- Developer Homeを出すまでの時間: 既定1時間（設定可）（08:57）
- 閲覧履歴の保存期間: 既定90日、変更可能
- ダウンロード保存先: Workspaceごとのフォルダ（仮置き: ~/Downloads/Trueful/<Workspace名>/、名前の無害化が必要）
- フェーズ2 完了
- MVP仮説: 「Workspaceで作業を分けつつ、拡張・ログイン・履歴など日常の機能が揃っていてChromeに戻る理由がない」状態なら1か月使い続けられる（OK）（08:59）
- MVP: 標準案。Workspace、タブ基本操作、ログイン保持、拡張＋適用範囲、内蔵広告ブロック、PDF、ダウンロード、ブックマーク取り込み、履歴、Command Palette、Developer Home＋1時間ルール、クラッシュ復元、更新通知、オンボーディング
- MVP外（Should）: Inspector Bar、Tier Aツール集（Inspector Agent と一緒に後で）
- MVP完成の定義: (1) 自動テスト（unit / IPC / E2E）が全て通る (2) るりあの監査チェックリストを全項目合格 (3) 1か月メイン利用し、Chromeに戻った日と理由を記録してゼロ〜許容範囲
- フェーズ3 完了
- Electron追従: 新メジャー公開から4週間以内に追従（09:02）
- 「軽い」の定義: 体感速度とメモリ上限（既存の性能予算）。インストールサイズは対象外（09:04）
- 技術スタック: 推奨案で確定（Electron 44 / WebContentsView / React 19 / TS 5.9系 / electron-vite 5 / better-sqlite3 13 / electron-builder 26 / electron-updater 6 / Vitest / Playwright / electron-chrome-extensions / electron-chrome-web-store / @ghostery/adblocker-electron）
- 対応OS: macOS・Windows・Linux（Linux実機がないためCIで確認）
- 最低動作環境: メモリ8GB
- フェーズ4 完了
- 既存の運用方針（Sentryオプトイン・デフォルトOFF、利用統計なし、ログ7日）は引き継ぐ
- 追加の脅威: 悪意ある拡張、Electron更新の遅れ、依存ライブラリの汚染、配布ファイルの改ざん（SHA256を公開）
- 脆弱性の報告先: GitHubの非公開報告機能（Private vulnerability reporting）（09:06）
- 拡張の導入元: Chromeウェブストア＋開発中の拡張（unpacked）の読み込み。unpackedは開発者モードON時のみ、読み込み時に警告を表示
- ライセンス: GPL-3.0（09:08）。既存コードに他メンバーの貢献があれば、変更前に同意を得る
- アクセシビリティは既存方針（キーボード完結、色だけに頼らない、ARIA）を引き継ぐ。多言語はMVPでは日本語のみ
- フェーズ5 完了
- デザイン: 既存 Design System v1.1 を引き継ぐ
- テーマ: ライト/ダークを選択可能。既定はOSの設定に合わせる（09:10）
- 密度: ゆったり（余白多め）
- レイアウト: 「タブ位置」「サイドバー状態」の2設定で構成。MVPは縦タブ＋展開（A）と、Cmd+Bで畳むレール。横タブは後回し（09:11）
- 現在のWorkspace名とMode色は、レール時も含め常に表示
- コンポーネントと状態を仮決め（SPEC 8章へ）。ウィンドウ幅 960px 未満でサイドバーを自動でレールに
- ブックマーク表示: Command Palette＋サイドバー下部（09:12）
- 拡張ボタン: アドレスバー右端
- フェーズ6 完了
- 成功基準の運用: Chromeに戻った回数は問わず、日付と理由を記録。欠陥由来はIssue化し、1か月後にるりあが合否判断（09:14）
- オンボーディング: MVPから外し公開前に回す（Workspace 0個時は最小の作成画面のみ）
- 監査: PRごとに監査し、マージはるりあのみ
- フェーズ7 完了（機械点検: 曖昧語0件、SPEC全12章あり、F01〜F16すべてに受け入れ条件とPLANのタスクあり）
- フェーズ8 完了: SPEC.md / PLAN.md / CLAUDE.md を作成

## 却下した案
- なし

## 未決事項
- Googleログイン拒否の既知問題 → 試作項目（不可なら合格ライン見直し）
- 「全Workspace共通」の拡張の技術的な実現方法: 拡張の読み込みはセッション単位で、WorkspaceごとにCookie分離のパーティションがあるため、共通でも実体とログイン状態はWorkspaceごとに分かれる可能性 → 試作項目
- SPEC.md 11章の「未決事項と期限」を参照
- 英語UI後回しは「みんなが使える」と緊張関係 → フェーズ7で再確認
- 既存コードが Electron 39（サポート外）と BrowserView（非推奨）→ Electron 44 と WebContentsView へ（ADR-008 改訂）
- 試作で先に確かめるリスク: (1) Googleログイン (2) MV3拡張の動作と導入（1Password/Bitwarden、React DevTools、翻訳）と「全Workspace共通」時のログイン共有 (3) PDF閲覧
- electron-chrome-extensions 4.9.0 は GPL と有償ライセンスのデュアル → 採用すると Trueful は GPL 互換ライセンスが必要（フェーズ5で決定）
- LICENSE が「All rights reserved」で、OSSライセンスになっていない（フェーズ5で決定）
- electron-chrome-extensions 4.9.0 のライセンス（LICENSE.md 参照、要確認）

## 次に聞くこと
- なし（実装は新しいセッションで PLAN の M0 から）

## 実装用の最初のプロンプト案
SPEC.md、PLAN.md、CLAUDE.md を読んでください。まず PLAN.md の M0（T0-1〜T0-3）について、spikes/ の構成と各試作の確認手順を計画として出してください。実装は私が計画を承認してから始めてください。

---
完了 2026-09-27 09:15 JST

## 追加の議論（2026-09-27 完了後）
- Command Paletteは作らない（ADR-015）。上端の統合検索欄に集約。MVPで「その場の答え」と「開発者向けの近道」を入れる
- 左パネルはVS Code型の1段目・2段目。他のWorkspaceは名前だけ、破棄済みタブは薄い色＋休止マーク
- 拡張の配置は3方式（1段目／統合検索欄の右／両方）を設定で選択、既定は1段目。3方式ともMVP
- 最近使ったタブ列は2段目を畳んだときだけ表示（最大5枚）
- 選択色はグレー系、BlueはProduction専用
- タブのWorkspace間移動（F17）、Workspace切替ショートカット（mac: Ctrl+1〜9、Win/Linux: Alt+1〜9）を追加
- 試作を追加: T0-4（検索候補の重ね表示）、T0-5（広告ブロックと拡張の共存）、T0-2追記（ネイティブメッセージング、sidePanel API）、T1-3a（SQLite実装の比較）
- 監査ルール追加: PR 300行以内、るりあ向けの解説、別セッションのレビュー、精読はIPC・セキュリティ設定・DBスキーマ
- 機械点検: 曖昧語0件、全12章あり、F01〜F17すべてに受け入れ条件とタスクあり、R1〜R5すべてPLANに対応
