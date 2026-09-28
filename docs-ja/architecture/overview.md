# アーキテクチャ概要

## 構成

- **Main Process（Node.js）**：Workspace管理、設定、ローカルAI連携、履歴インデックス
- **Renderer**：WebContentsView（Workspaceごとに独立したセッションパーティション。ADR-008 を 2026-09-27 に改訂）
- **ローカルDB**：`node:sqlite`（履歴・インデックス・Workspace定義。ADR-002）
- **ローカルAI**：Ollama（既定）
- **クラウドAI**：Claude API（Workspace単位で明示的opt-in、サイレントフォールバック禁止）

採用理由の詳細は [ADR-001: Electron + Chromium](./adr/adr-001-electron.md) を参照。

## Layer → 機能マッピング

| Layer | 機能 |
|---|---|
| 0 | Command Palette（Ctrl+Shift+P）+ Developer Home（Docs/GitHub/Status/APIへの直接リンク） |
| 1 | No Confusion：Workspace単位のセッション分離／Never Get Lost：Suggested Next（提示のみ）／Predictable：自動実行ホワイトリスト／Transparency：Inspector Bar常設／Zero Noise：デフォルトブロック＋設定折りたたみ |
| 2 | Everything Configurable：settings.json＋GUI／Security Is a Choice：Production・Development・Testingプリセット／Local First：Ollamaデフォルト＋クラウドopt-in／Keyboard First：keybindings.json／Extensible：Plugin API／Inspectable：CDP経由の右クリック検査／Failure Friendly：自動スナップショット／Open Standards：Chromium準拠 |
| 3 | Workspace = JSONマニフェスト（Git管理可能） |

### Layer 0（Core Values）詳細

**Command Palette + Developer Home**

- Ctrl+Shift+P で全操作にアクセス（VSCode方式）
- 新規タブページの代わりに「Developer Home」：検索ではなくDocs / GitHub / Status / API への直接リンクを表示
- 新機能追加の判断基準：「1クリック減るか、5秒縮むか」（#19 Time First）

### Layer 1（Interaction Contract）詳細

| 原則 | 機能 |
|---|---|
| No Confusion | Workspace単位でセッションパーティション分離。同一サービスでもUser/Developerをアイコン・色分けで区別 |
| Never Get Lost | 「Suggested Next」パネル（サイドバー常設、非侵襲）。提示のみ、自動遷移は絶対にしない |
| Predictable | 自動実行はホワイトリスト方式。デフォルト全OFF、opt-inのみ許可 |
| Transparency | 「Inspector Bar」を画面下部に常設。現在のセキュリティモード・送信Cookie・参照AIコンテキストをワンクリックで展開 |
| Zero Noise | Cookieバナー / ログインポップアップ / マーケティングオーバーレイをデフォルトブロック。設定項目はデフォルト折りたたみ |

### Layer 2（Technical Freedom）詳細

| 原則 | 機能 |
|---|---|
| Everything Configurable | settings.json + GUI。Command Paletteから設定項目を横断検索可能 |
| Security Is a Choice | Workspace単位のセキュリティプリセット（Production / Development / Testing）。切替時はInspector Barが即座に反映 |
| Local First | 履歴・インデックス・AIはデフォルトでローカル（Ollama）。クラウド利用はWorkspace設定で明示的opt-in |
| Keyboard First | keybindings.json で全操作を再割当て可能 |
| Extensible | Node.jsベースの自作Plugin API + 標準Chrome拡張のロード対応 |
| Inspectable | 右クリックで Cookie / Storage / Service Worker / Network / Security Header に直接アクセス（CDP経由） |
| Failure Friendly | Workspace自動スナップショット（Gantt Chart Studioのautosaveパターンを流用）+ 手動Restore |
| Open Standards | Chromiumレンダリング準拠。拡張APIは可能な限りWeb標準に寄せる |

### Layer 3（Work Unit Model）詳細

**Workspace**

- Workspace = JSONマニフェスト（tabs, URL, profile, extension state）。Git管理可能な形式でエクスポート/インポート
- タブは常にWorkspace配下にグルーピングされる。フラットなタブバーは存在しない

## 検討した代替案と却下理由

| 候補 | 却下理由 |
|---|---|
| CEF（C++） | 学習・保守コストがLayer 0（Developer First = 自分自身も開発者）に反する |
| Tauri（Rust + WebView2） | WebView2はCDPアクセスがChromiumほど自由でなく、Inspectable / Security Is a Choiceの実現度が下がる |

→ この判断自体、Layer 0 が Layer 2 の手段選択を裁定した実例である。

関連: [ADR一覧](./adr/) / [データスキーマ](./data-schema.md) / [IPC仕様](./ipc-spec.md)
