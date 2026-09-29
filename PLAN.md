# Trueful 実装計画（MVP）

- 前提: `SPEC.md` を正とする。各タスクは Claude Code の1セッションで完了し、1つのPRになる大きさ。
- 各タスクの共通の完了条件: 受け入れ条件をすべて満たし、`pnpm typecheck && pnpm lint && pnpm test` が通り、差分が300行以内で、PRに合否表・スクリーンショット・るりあ向けの解説・別セッションのレビュー結果を付け、るりあの監査を通ってマージされる。
- 依存: 「依存」欄のタスクがマージされるまで着手しない。

## M0 試作（最も不確かな部分を先に確かめる）

本体とは別の `spikes/` で、Electron 44 の最小アプリを使う。結果は `spikes/<名前>/RESULT.md` に書き、SPEC 3章のリスク表を更新する。

### T0-1 Googleログインの試作（R1）
- 目的: Electron 44 のWebContentsViewでGoogleにログインでき、再起動後も保持されるか確かめる。
- 関係: `spikes/google-login/`
- 受け入れ条件: 素の状態、User-Agentから `Electron/` を除いた状態の2通りで、ログイン可否と保持の可否を記録している。拒否された場合は画面のスクリーンショットがある。
- 検証: `pnpm --dir spikes/google-login start` を手で実行し、RESULT.mdの手順どおりに確認。
- 範囲外: 本体への組み込み。
- 依存: なし

### T0-2 拡張機能の試作（R2）
- 目的: `electron-chrome-extensions` と `electron-chrome-web-store` で、必要な拡張が動くか確かめる。
- 関係: `spikes/extensions/`
- 受け入れ条件: 1Password、Bitwarden、React DevTools、翻訳拡張（1つ）について、ストア導入の可否、主要操作（ログインフォームへの入力、DevToolsパネル表示、翻訳の実行）の可否を表にしている。unpackedの読み込みも1つ確認している。2つのパーティションに同じ拡張を読み込んだとき、ログイン状態が共有されるかを記録している。デスクトップアプリとの連携（ネイティブメッセージング）と、サイドパネル（sidePanel API）の可否も記録している。
- 検証: RESULT.mdの手順を手で実行。
- 範囲外: 適用範囲のUI。
- 依存: なし

### T0-3 PDF表示の試作（R3）
- 目的: ChromiumのPDFビューアがElectron 44で使えるか確かめる。
- 関係: `spikes/pdf/`
- 受け入れ条件: URLとローカルファイルの両方で、表示・拡大・ページ内検索・印刷の可否を記録している。
- 検証: RESULT.mdの手順を手で実行。
- 範囲外: 本体への組み込み。
- 依存: なし

### T0-4 検索候補の重ね表示の試作（R4）
- 目的: 統合検索欄の候補一覧を、Webページの上に出せるか確かめる。
- 関係: `spikes/omnibox-popup/`
- 受け入れ条件: 候補一覧を小さな専用のWebContentsViewとして最前面に出し、入力中に候補が更新される、上下キーで選べる、Escで閉じる、ウィンドウの移動・リサイズで位置がずれない、の4点を記録している。代替案（ページを固定の高さだけ下げる）も同じ4点で比べている。
- 検証: RESULT.mdの手順を手で実行。
- 範囲外: 候補の中身。
- 依存: なし

### T0-5 広告ブロックと拡張の共存の試作（R5）
- 目的: `@ghostery/adblocker-electron` と `electron-chrome-extensions` を同時に使えるか確かめる。
- 関係: `spikes/adblock-extensions/`
- 受け入れ条件: 両方を有効にした状態で、広告テスト用ページの遮断と、T0-2で動いた拡張の主要操作の両方を確認している。動かなくなったものがあれば、原因のAPIを記録している。
- 検証: RESULT.mdの手順を手で実行。
- 範囲外: 本体への組み込み。
- 依存: T0-2

**M0のデモ**: 5つのRESULT.mdを並べ、るりあがR1〜R6の対応（続行・合格ライン見直し・代替案）を決める。決定をSPEC 11章に記録してからM3に進む。M1・M2 は M0 の結果に依存しないので、M0 の実機確認と並行して進めてよい（2026-09-27 に、るりあが判断）。

## M1 基盤

### T1-1a ADR の取り込みと ADR-008 の改訂
- 目的: 前のリポジトリ（Trueful/Trueful）の設計文書を本リポジトリで参照・改訂できるようにする。
- 関係: `docs-ja/architecture/`（取り込み）、`docs-ja/architecture/adr/adr-008-browserview.md`（改訂）
- 受け入れ条件: `docs-ja/architecture/` を、取り込み元のコミットを記録して取り込んでいる。ADR-008 を WebContentsView 採用に改訂している。SPEC・PLAN の「既存の `app/`」を前提にした記述を、実態に合わせている。
- 検証: 差分の目視（文書のみ）。
- 範囲外: `docs-ja/` のほかの文書（哲学、Master Spec、Design System 等）の取り込み。必要になったときに行う。
- 依存: なし（文書のみ。2026-09-27 に、るりあが M0 から外すと判断）

### T1-1b Electron 44 のアプリの土台
- 目的: 本リポジトリに、Electron 44 で本体の土台（`app/`）を作る。前のリポジトリの `app/` は electron-vite のテンプレートのまま（Electron ^39、三ペインの骨格なし、`sandbox: false`）だったため、構成（electron-vite 5、React 19、TypeScript、ESLint、Prettier）だけを引き継いで作り直す。
- 関係: `app/package.json`、`app/src/main/index.ts`、`app/src/preload/index.ts`、`app/src/renderer/`
- 受け入れ条件: `electron` が 44.4.5。`BrowserView` の使用が0件（`grep -r BrowserView app/src` が空）。`sandbox`・`contextIsolation` が有効で、preload から `ipcRenderer` を出していない。上端・左パネル・中央の3つの領域の枠が表示される（中身は空）。pnpm 12 で `pnpm install` だけで Electron 本体が入る。
- 検証: `pnpm typecheck && pnpm lint && pnpm build:unpack` と起動確認。起動した画面のスクリーンショットを PR に付ける。`pnpm test` は T1-2 までは対象外。差分が300行を超える見込みなら、設定ファイルだけの PR と画面の PR に分ける。
- 範囲外: 新機能、IPC（T1-4）、WebContentsView の配置（M2）。
- 依存: T1-1a

### T1-2 テスト基盤とCI
- 目的: 3OSで自動検証できるようにする。
- 関係: `app/vitest.config.ts`、`app/playwright.config.ts`、`.github/workflows/ci.yml`
- 受け入れ条件: `pnpm test` と `pnpm test:e2e`（起動してウィンドウが出るだけのE2E 1本）が動く。GitHub Actionsで macos-latest・windows-latest・ubuntu-latest の3つが通る。CIで `pnpm audit` を実行している。
- 検証: CIの結果画面。
- 範囲外: 性能計測。
- 依存: T1-1b

### T1-3a SQLite実装の比較
- 目的: better-sqlite3 と `node:sqlite` のどちらを使うか決める材料を出す。
- 関係: `spikes/sqlite-compare/`
- 受け入れ条件: Electron 44 上で両方を動かし、3OSのCIでのビルド可否、再ビルドの要否、1万件の挿入と検索の時間、`node:sqlite` の安定度（Node.jsでの扱い）を表にしている。
- 検証: CIの結果と表。
- 範囲外: スキーマの実装。
- 依存: T1-2

### T1-3 SQLiteのスキーマとマイグレーション
- 目的: SPEC 6章のテーブル（定義は `docs-ja/architecture/data-schema.md` の版1）を `node:sqlite` で作り、バージョン管理する。
- 関係: `app/src/main/db/`
- 受け入れ条件: T1-3aで決めた実装（`node:sqlite`、ADR-002）を使う。空のDBから最新スキーマを作れる。マイグレーションのバージョンが記録される。起動時にバックアップを1世代作る。各テーブルの作成と、既存 `workspace` 列の定義がADRと一致することを単体テストで確認。
- 検証: `pnpm test`
- 範囲外: データの読み書きAPI。
- 分割（2026-09-28、差分が300行を超えるため）: T1-3-1 DBの土台（開く・確かめる・バックアップ・マイグレーションの仕組み）、T1-3-2 版1のスキーマとその検証。T1-3-2はT1-3-1のマージ後に着手する。
- 依存: T1-3a

### T1-4 IPC基盤と設定（F14の土台）
- 目的: 型付きのIPCと `settings.json` の読み書きを用意する。
- 関係: `app/src/main/ipc/`、`app/src/preload/index.ts`、`app/src/main/settings/`
- 受け入れ条件: チャネルは1か所で定義され、受信側で引数を検証する。不正な引数は拒否されエラーが返る（IPCテスト）。`settings.json` が壊れていたら既定値で起動し、通知する。`contextIsolation`・`sandbox` が有効であることをテストで確認。
- 検証: `pnpm test`
- 範囲外: 設定画面のUI。
- 依存: T1-3

**M1のデモ**: 3OSのCIが緑。アプリが起動し、DBと `settings.json` が作られる。

## M2 中核（Workspaceとブラウジング）

### T2-1 Workspaceの作成・一覧・切替（F01の一部）
- 関係: `app/src/main/workspace/`（services / flows）、`workspaceDB.ts`
- 受け入れ条件: F01の「作成」「切替300ms以内」を満たす。Workspace 0個のときに作成画面が出る。二重作成を防ぐ。
- 検証: `pnpm test && pnpm test:e2e`
- 範囲外: 休止・アーカイブ。
- 分割（2026-09-28）: T2-1a Main 側（DB・作成と切替の流れ・IPC）、T2-1b 画面（Workspace 0個の作成画面、一覧と切替、UI の辞書。切替300msは画面の切り替えを含めてここで計測する）、T2-1c マニフェストとフォルダ（ADR-013 の COM 側の json、Workspace のフォルダ構成、作成時に同じ id のパーティションが残っていたら消す。data-schema.md の「Workspace のフォルダ」「Workspace の削除」）。USER 側の json は MVP では作らず、Phase 2 の Git 連携で足す（2026-09-28、SPEC 6章に合わせた）。F01 の「作ると空のタブが1つ開く」は T2-2 で満たす。
- 依存: T1-4

### T2-2 タブとナビゲーション（F02）
- 関係: `app/src/main/tab/`、`app/src/renderer/src/components/AddressBar`
- 受け入れ条件: F02の受け入れ条件をすべて満たす。WebContentsViewの位置とサイズは、Rendererの空divからIPCで報告される。Workspaceを作ると空のタブが1つ開く（F01）。
- 検証: `pnpm test:e2e`
- 範囲外: 拡張ボタン。WebContentsView 実体の30個の上限（T2-5）。
- 分割（2026-09-28）: T2-2a Main 側のタブ（DB・作成・閉じる・閉じたタブを戻す・選択・IPC、Workspace を作ると空のタブ）、T2-2b1 URL と検索語の解釈、T2-2b2 ページの表示（WebContentsView・アドレスバーの入力で開く・位置とサイズの報告・ページの様子の知らせ）、T2-2c1 Main 側の操作（戻る/進む/再読み込み/停止、window.open を新しいタブで開く、メニューのショートカット Cmd/Ctrl+T・W・Shift+T・R・L・K、ページの開発者ツール。ページの拡大・縮小は後のタスク）、T2-2c2 画面（タブ列・アドレスバー・ボタン・空の div からの位置の報告・E2E とスクリーンショット）。タブ列は SPEC の2段目に合わせて左パネルの Workspace の一覧の下に置き、作り込み（最近使ったタブ列・破棄済みの表示など）は T2-4 で行う。
- 依存: T2-1

### T2-3 パーティションとログイン保持（F03）
- 受け入れ条件: F03の受け入れ条件を満たす（Googleの条件はM0の決定に従う）。WorkspaceAのCookieがBから見えないことをE2Eで確認。
- 検証: `pnpm test:e2e`
- 注意（2026-09-28、T2-2c1 のレビュー）: ページの `window.open` は、断ってから新しいタブで開き直すので、`window.opener`・`postMessage`・POST の本文が失われる。ポップアップ方式のログイン（Google Identity Services の popup、Firebase の signInWithPopup など）が戻ってこない。ここで実機で確かめ、必要なら `setWindowOpenHandler` の `createWindow` でタブに入れる方式に変える。
- 依存: T2-2

### T2-4 左パネル（F15の前半）
- 関係: `app/src/renderer/src/components/ActivityBar`、`SidePanel`、`WorkspaceRow`、`TabItem`、`CurrentWorkspaceBadge`
- 受け入れ条件: 1段目・2段目、今のWorkspaceだけ展開、破棄済みタブの表示、2段目の開閉（Cmd/Ctrl+B、960px未満で自動）、選択色がグレー系、を満たす。ライト・ダークの両方でコントラストAA。キーボードだけで操作できる。
- 検証: `pnpm test:e2e` とスクリーンショット（ライト・ダーク × 2段目の開閉）
- 範囲外: 拡張の配置3方式と最近使ったタブ列（T3-8）。
- 依存: T2-2

### T2-5 休止・復帰・アーカイブ・削除と上限（F01の残り、F02の上限）
- 受け入れ条件: F01の休止・復帰・アーカイブ・削除、F02のWebContentsView実体30個の上限を満たす。ADR-011の境界値（5個目と6個目、29個目と31個目）を単体テストで確認。
- 分割（2026-09-29）: T2-5a タブのページの実体30個の上限と破棄済みタブの表示（F15）、T2-5b1 Workspace の休止・復帰（Main 側。LRU、ページの破棄、URL とスクロール位置を戻す）、T2-5b2 休止・アーカイブの表示と事後の知らせ（画面）、T2-5c 削除。
- T2-5c の方針（るりあの決定、2026-09-29）: 削除は確認ダイアログで「ログイン（Cookie）とサイトのデータも消える」と明示する（名前の打ち込みは求めない）。削除前のスナップショットは名前・Mode・タブの URL とタイトルだけ（Cookie・ストレージは入れない。戻す画面は MVP の範囲外）。パーティションは削除したらすぐ、片付け用のフォルダへ移してから消す。
- 検証: `pnpm test && pnpm test:e2e`
- 依存: T2-4

### T2-6 タブのWorkspace間移動と切替ショートカット（F17、F01の一部）
- 関係: `app/src/main/workspace/flows/`、`app/src/renderer/src/components/MoveTabMenu`
- 受け入れ条件: F17をすべて満たす。F01のWorkspace切替ショートカット（macOS: Ctrl+1〜9、Windows・Linux: Alt+1〜9）が動き、Chromeと同じタブ切替（Cmd/Ctrl+1〜9）と衝突しない。
- 検証: `pnpm test && pnpm test:e2e`
- 依存: T2-5

**M2のデモ**: 3つのWorkspaceを作り、それぞれ別アカウントでログインし、切り替えても混ざらないことを動画で示す。

## M3 日常機能

着手の条件: M0 のデモを終え、R1〜R6 の対応を SPEC 11章に記録していること（T3-4 は R3、T3-5 は R5、T3-6 は R2 の結果を使う）。

### T3-1 閲覧履歴（F09）
- 受け入れ条件: F09をすべて満たす。10万件のダミーデータで検索が16ms以内（単体テストで計測）。
- 依存: T2-3

### T3-2 ブックマークと取り込み（F08）
- 受け入れ条件: F08をすべて満たす。3OSのChromeプロファイルの場所を扱う。取り込みは1トランザクション。サンプルの `Bookmarks` とHTMLで単体テスト。
- 依存: T2-4

### T3-3 ダウンロード管理（F07）
- 受け入れ条件: F07をすべて満たす。フォルダ名の無害化と連番を単体テストで確認。
- 依存: T2-3

### T3-4 PDF閲覧（F06）
- 受け入れ条件: F06をすべて満たす（M0の結果に従う）。
- 依存: T2-2

### T3-5 内蔵広告ブロック（F05）
- 受け入れ条件: F05をすべて満たす。拡張の `webRequest` と衝突しない方式であることをRESULT.md（T0-2）と照合して説明している。
- 依存: T2-3

### T3-6 拡張機能（F04）
- 受け入れ条件: F04をすべて満たす。T0-2で動いた拡張が本体でも同じ結果になる。
- 検証: `pnpm test:e2e` と手動確認の動画
- 依存: T3-5、M0の決定

### T3-7 サイトの権限とエラー画面（F16）
- 受け入れ条件: F16をすべて満たす。
- 依存: T2-3

### T3-8 拡張の配置3方式と最近使ったタブ列（F15の後半）
- 関係: `app/src/renderer/src/components/ExtensionButtons`、`RecentTabsStrip`、設定
- 受け入れ条件: F15の拡張の配置3方式（既定は1段目）、最近使ったタブ列（2段目を畳んだときだけ、最大5枚）を満たす。3方式×2段目の開閉の6通りでE2Eが通り、切り替えでページがちらつかない。
- 検証: `pnpm test:e2e` と6通りのスクリーンショット
- 依存: T2-4、T3-6

**M3のデモ**: パスワード管理の拡張でログインし、PDFを開き、ファイルをダウンロードし、ブックマークと履歴から戻る、を一続きで動画にする。

## M4 Truefulらしさ

### T4-1 統合検索欄の基盤（F10の前半）
- 関係: `app/src/main/omnibox/`（候補の提供元ごとにservicesを分ける: tabs、history、bookmarks、workspaces）、候補一覧のView（T0-4で決めた方式）
- 受け入れ条件: URL入力、Web検索、タブ・履歴・ブックマーク・Workspaceの候補、候補の並び順（他のWorkspaceにMode色の印）、キーボード操作を満たす。候補の更新16ms以内をE2Eで計測。履歴10万件（URL 10万種類）で、3文字以上のよくある語と、2文字でヒットなしの検索が16ms以内に返る単体ベンチを置く（`data-schema.md` の「履歴の検索」）。
- 依存: T3-1、T3-2、M0の決定（T0-4）

### T4-1b 操作・その場の答え・近道（F10の後半）
- 関係: `app/src/main/omnibox/`（commands、answers、shortcuts）、操作の定義ファイル
- 受け入れ条件: Truefulの操作が言い換えの語で見つかる。その場の答え（Unix時刻、計算、色、Base64、URLエンコード、UUID）と近道（localhost、gh、npm、mdn）を単体テストで確認。言い換え語の初期セットはるりあの承認済み。
- 依存: T4-1

### T4-2 起動時の復元とDeveloper Home（F11）
- 受け入れ条件: F11をすべて満たす。時刻をモックして「1時間以内」「超過」「表示しない設定」の3通りをテスト。
- 依存: T2-5

### T4-3 クラッシュからの復元（F12）
- 受け入れ条件: F12をすべて満たす。ADR-012の3パターンを再現するテストがある。
- 依存: T4-2

### T4-4 設定画面（F14）
- 受け入れ条件: F14をすべて満たす。画面での変更と `settings.json` の手編集の両方が反映される。
- 依存: T4-2、T3-6

**M4のデモ**: 1章のシナリオ1〜3を通しで実演する。

## M5 仕上げと試用開始

### T5-1 配布と更新通知（F13）
- 関係: `electron-builder.yml`、`.github/workflows/release.yml`
- 受け入れ条件: タグを打つと3OSのインストーラ（dmg/zip、NSIS、AppImage）とSHA256がGitHub Releasesに上がる。F13をすべて満たす。
- 依存: T4-4

### T5-2 性能予算のCI化
- 受け入れ条件: 起動2秒、切替300ms、Palette 16msを計測し、超えたらCIが失敗する。
- 依存: T5-1

### T5-3 OSS文書
- 受け入れ条件: LICENSE（GPL-3.0、メンバーの同意を得た後）、SECURITY.md、CONTRIBUTING.md、READMEの開発体制と未署名アプリの起動方法、threat-model.mdの追記、ADR-006の改訂、ADR-015（Command Paletteの廃止）、Design System v1.2（左パネルの構成、選択色）、`roadmap/mvp-scope.md` と `tools/command-palette-tools.md` の更新が揃っている。
- 依存: なし（LICENSE部分のみ、るりあの同意取得後）

### T5-4 監査と試用開始
- 受け入れ条件: SPEC 9章の監査チェックリストをすべて満たし、`docs-ja/trial/chrome-return-log.md` を作って1か月の試用を始める。
- 依存: T5-1、T5-2、T5-3

## MVP機能とタスクの対応
| 機能 | タスク |
|---|---|
| F01 | T2-1、T2-5、T2-6 |
| F02 | T2-2、T2-5 |
| F03 | T2-3 |
| F04 | T0-2、T3-6 |
| F05 | T0-5、T3-5 |
| F06 | T0-3、T3-4 |
| F07 | T3-3 |
| F08 | T3-2 |
| F09 | T3-1 |
| F10 | T0-4、T4-1、T4-1b |
| F11 | T4-2 |
| F12 | T4-3 |
| F13 | T5-1 |
| F14 | T1-4、T4-4 |
| F15 | T2-4、T3-8 |
| F16 | T3-7 |
| F17 | T2-6 |
