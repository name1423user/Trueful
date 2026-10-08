# Trueful（トルフ） 要件定義 v2

- 作成: 2026-09-27（要件定義インタビューによる再定義）
- 更新: 2026-09-27 v2.1（Command Paletteの廃止、統合検索欄、左パネルの2段構成、試作項目の追加を反映）
- 位置づけ: 既存の `docs-ja/`（哲学・Master Spec・ADR-001〜014・Design System v1.1）の大半を引き継ぎ、差分だけを定義し直す。本書と既存文書が食い違う場合は本書を優先し、該当するADRを改訂する（11章）。既存文書は前のリポジトリ（[Trueful/Trueful](https://github.com/Trueful/Trueful)）にあり、`docs-ja/architecture/`（ADR を含む）だけを本リポジトリに取り込んだ（2026-09-27、T1-1a）。それ以外は必要になったときに取り込む。
- 体制: 実装は Claude Code、設計判断と監査は るりあ。共同開発（メンバー2人）はいったん保留。

## 1. 概要

### 目的
開発者の時間を奪わないブラウザ。作業ごとに「Workspace」でタブ・ログイン・拡張を分け、日常のWeb作業をChromeに戻らずに完結させる。

### 解決する課題
Chrome等の汎用ブラウザでは、複数の案件・アカウント・調べものがタブに混ざり、切り替えのたびに探す時間とログインの取り違えが起きる。

### 利用者
- MVP: るりあ本人（合否の判定者）
- 公開後: OSSとして不特定多数の開発者（Power User First。一般ユーザー向け最適化はしない）

### 利用シーン
1. 朝、Truefulを起動する。前回の終了から1時間を超えているのでDeveloper Homeが開き、Workspaceの一覧から「Trueful開発」を選ぶ。前回のタブとGitHubのログインが戻っている。
2. 作業中に過去に見たページを探す。上端の統合検索欄に打つと、開いているタブ・履歴・ブックマークが候補に出る。`1727400000` と打てば日時が、`3000` と打てば `localhost:3000` を開く候補が、Web検索より先に出る。
3. 別案件の管理画面を開くときは、Ctrl+2（macOS）で「案件B」Workspaceに切り替える。左端の1段目の一番上に現在のWorkspaceの頭文字とMode色（ProductionはBlue）が常に出ているので、本番アカウントでの誤操作に気づける。

### 成功基準（測れる形）
- るりあが1か月間、Truefulを作業用のメインブラウザとして使い続ける。
- Chromeに戻った場合は、回数は問わず、日付と理由を `docs-ja/trial/chrome-return-log.md` に記録する。Trueful側の欠陥が理由のものはすべてGitHub Issueにする。
- 1か月の終了時に、るりあが記録を見て合否を最終判断する。

### 制約
- 期限: なし。区切りはマイルストーンごとの動くデモと監査で作る。
- 予算・運用コスト: 0円。コード署名なし。サーバーを持たない（配布はGitHub Releases、クラッシュレポートはSentryの無料枠）。
- 動作環境: macOS・Windows・Linux。最低動作環境はメモリ8GB。
- 開発環境: MacBook Air（M1、16GB）、Windows 11 PC。Linuxの確認はGitHub ActionsのUbuntuで行う。

## 2. 範囲

### MVPで作るもの
F01〜F17（5章の機能一覧）。

### 後回し（消さずに残す）
| 項目 | 次に検討する時期 |
|---|---|
| 英語UI（i18n） | MVP後の最初のマイルストーンで最優先 |
| オンボーディング | 公開前 |
| Inspector Bar、Tier Aツール集 | Inspector Agentと一緒に |
| Inspector Agent一式（Tier A/B/C、AI Broker、Pattern Trust Ledger、Ollama） | Phase 2 |
| OSの既定ブラウザに設定する機能 | MVP後 |
| Plugin API、Workspace Git連携、マルチウィンドウ、ツリー型タブ | Phase 2 |

### 作らないもの
- アカウント・端末間同期、モバイル版、複数ビューポートの同時表示
- パスワードの保存と自動入力（パスワード管理の拡張に任せる。ChromeのパスワードCSVは管理アプリ側に取り込む）
- 独自レンダリングエンジン、Chromiumのフォーク（ADR-004）
- 匿名利用統計の収集
- Command Palette（役割を上端の統合検索欄に集約。ADR-015）

## 3. MVP

### 採用した案と理由
標準案。仮説「Workspaceで作業を分けつつ、拡張・ログイン・履歴など日常の機能が揃っていて、Chromeに戻る理由がない状態なら、1か月使い続けられる」に対して、合格ラインに必要な日常機能と、差別化の中核（Workspaceと統合検索欄）の両方を含む最小の構成。Inspector Barは表示する中身（Inspector Agent）が後回しのため外した。Command Paletteは、必要な役割（画面に出ていない機能に名前で届く入口）を統合検索欄が満たすため作らない。

### 完成の定義
1. 自動テスト（単体・IPC・E2E）がmacOS・Windows・UbuntuのCIですべて通る。
2. 9章の監査チェックリストを、るりあがすべて合格にする。
3. 1章の成功基準（1か月の利用と記録）を満たす。

### 先に試作で確かめるリスク
| # | リスク | 確かめること | 失敗したとき | 試作の結果 |
|---|---|---|---|---|
| R1 | GoogleがElectron内のログインを拒否する（"This browser or app may not be secure"） | Electron 44でGoogleアカウントにログインし、再起動後も保持されるか。User-Agentの調整で通るか | 合格ラインを見直す（るりあが判断） | 通過（macOS）。UA のままでも `Electron/` を除いても、ログインでき、再起動後も保持された。UA は `Electron/` を除く方を推奨。パスキーは反応せず、パスワードでログインした（[RESULT](spikes/google-login/RESULT.md)） |
| R2 | MV3拡張がElectronで動かない | 1Password・Bitwarden・React DevTools・翻訳拡張を、ストア導入とunpackedで入れて主要操作が動くか。「全Workspace共通」にした拡張のログインがWorkspace間で共有されるか。デスクトップアプリとの連携（ネイティブメッセージング）とサイドパネル（sidePanel API）が動くか | 動かない拡張を一覧化し、代替を決める。パスワード管理は拡張単体で動けば合格とし、不便ならOS全体の自動入力（1Password Quick Access等）を併用。致命的ならFirefoxフォーク案を再検討 | 試作あり・実機確認待ち。サイドパネルは Electron が未対応（`Permission 'sidePanel' is unknown`）。ライブラリは GPL-3.0 か有料ライセンス（[RESULT](spikes/extensions/RESULT.md)） |
| R3 | ChromiumのPDF表示がElectronで使えない | PDFのURLとローカルPDFを開き、拡大・検索・印刷ができるか | PDF.jsの組み込みを検討 | 条件付きで通過（macOS）。URL・ローカルとも、表示とビューアのボタンでの拡大はできた。`plugins` の設定は不要。検索は、URL では検索語がファイル名にも当たり本文に移らなかった。件数も期待値より1多い。印刷はビューアのボタンで出力できた（ローカルのみ確認）が、`webContents.print()` の出力は未確認。印刷プレビューはない（[RESULT](spikes/pdf/RESULT.md)） |
| R4 | 統合検索欄の候補一覧がWebページの層の下に隠れる | 候補一覧を小さな専用のWebContentsViewとして最前面に出し、入力中の表示・キー操作・フォーカスが崩れないか | 入力中だけページ表示領域を候補の高さ分下げる（固定の高さで毎回同じ動き） | 試作あり・実機確認待ち（[RESULT](spikes/omnibox-popup/RESULT.md)） |
| R5 | 内蔵広告ブロック（`session.webRequest`）と拡張の `chrome.webRequest` が衝突する | 両方を有効にして、必須の拡張（R2）と広告ブロックがともに動くか | 内蔵広告ブロックを優先し、`chrome.webRequest` に依存する拡張は管理画面で「一部動きません」と表示 | 試作あり・実機確認待ち。Ghostery は2つめのセッションで有効にできない（IPC の二重登録）。Electron 44 は MV3 の拡張に `chrome.webRequest` を届けない（広告ブロックと無関係）。MV2 の拡張では、広告ブロックを有効にすると `chrome.webRequest` が止まる（[RESULT](spikes/adblock-extensions/RESULT.md)、[調査](spikes/webrequest-probe/RESULT.md)） |
| R6 | パスキー（WebAuthn の Touch ID・iCloud キーチェーンなど）がElectronで使えない | 署名したアプリでGoogleと他のサイトにパスキーで登録・ログインできるか | パスワードや他の確認方法でログインしてもらい、パスキーだけのアカウントは合格ラインの対象外にする（るりあが判断） | T0-1で発見。macOSの未署名のアプリで、パスキーの画面は出るがTouch IDのダイアログが出ない。署名したアプリでは未確認（[RESULT](spikes/google-login/RESULT.md)） |

## 4. プラットフォームと技術

### 動作環境と選定理由
Electron製のデスクトップアプリ（macOS・Windows・Linux）。Chrome拡張を動かせる現実的な基盤はChromiumだけで、既存の仕様を活かせるため。

### 技術スタック
| 用途 | 採用 | バージョン（2026-09-27時点のnpm最新） |
|---|---|---|
| アプリ基盤 | Electron | 44.4.5（前のリポジトリの `app/` は ^39 のテンプレートのままだったため引き継がず、本リポジトリに新しく作る） |
| タブ表示 | WebContentsView | Electron内蔵（BrowserViewは非推奨のため移行） |
| UI | React | 19.3.0 |
| 言語 | TypeScript | 5.9系を維持（7.0は周辺ツールの対応確認後） |
| ビルド | electron-vite / Vite | 5.0.0 / 既存に合わせる |
| DB | SQLite（`node:sqlite`、ADR-002） | Electron 44 の Node 24.21 に組み込み（Stability 1.2）。依存・再ビルドなし |
| 検証 | zod | 4.6.5（IPC の引数と `settings.json` を受信側で検証する。T1-4 で追加） |
| 配布 | electron-builder / electron-updater | 26.15.3 / 6.8.9 |
| 拡張機能 | electron-chrome-extensions / electron-chrome-web-store | 4.9.0（GPL-3.0） / 0.13.0（MIT） |
| 広告ブロック | @ghostery/adblocker-electron | 2.18.2（MPL-2.0） |
| テスト | Vitest / Playwright | 5.0.2 / 1.63.0 |
| クラッシュレポート | Sentry（オプトイン、既定OFF） | 既存方針どおり |
| パッケージ管理 | pnpm | 12.3.4（既存） |

### 追従方針
Electronの新しいメジャー版が公開されたら4週間以内に追従する。

### 採用しなかった案と理由
- Tauri: Chrome拡張が動かず、macOSではWebKitになる。
- Chromiumのフォーク: ADR-004で却下済み。ビルドと保守の負担が大きい。
- Firefoxのフォーク（Zen方式）: 拡張は確実に動くが、既存資産をすべて捨てる。R2が致命的だった場合にだけ再検討する。

### 外部サービス
GitHub Releases（配布・更新情報）、Chromeウェブストア（拡張の取得）、Sentry（オプトイン時のみ）。

### 根拠のURL
- https://www.electron.build/auto-update/ （macOSの自動更新には署名が必要）
- https://www.electronjs.org/blog/migrate-to-webcontentsview （BrowserViewの非推奨とWebContentsViewへの移行）
- https://github.com/electron/electron/issues/49984 （MV3対応のissue、対応予定なしで終了）
- https://www.npmjs.com/package/electron-chrome-extensions （Electronの拡張対応の範囲とライセンス）
- https://github.com/agentify-sh/desktop/issues/11 （Electron内のGoogleログイン拒否の事例）

## 5. 機能要件

### 機能一覧と優先度
| ID | 機能 | 優先度 |
|---|---|---|
| F01 | Workspaceの作成・切替・休止・復帰・アーカイブ・削除 | Must |
| F02 | タブとナビゲーション | Must |
| F03 | ログイン状態の保持（Workspaceごとのパーティション） | Must |
| F04 | 拡張機能（ストア導入、開発中の拡張、適用範囲、ボタン） | Must |
| F05 | 内蔵広告ブロック | Must |
| F06 | PDF閲覧 | Must |
| F07 | ダウンロード管理 | Must |
| F08 | ブックマーク（Chromeから取り込み、保存、表示） | Must |
| F09 | 閲覧履歴（保存と検索） | Must |
| F10 | 統合検索欄（URL・検索・タブ・履歴・ブックマーク・Workspace・操作・その場の答え・近道） | Must |
| F11 | 起動時の復元とDeveloper Home | Must |
| F12 | クラッシュからの復元 | Must |
| F13 | 更新通知 | Must |
| F14 | 設定 | Must |
| F15 | 左パネル（1段目・2段目）、拡張の配置3方式、最近使ったタブ列 | Must |
| F16 | サイトの権限とエラー画面 | Must |
| F17 | タブを別のWorkspaceへ移動 | Must |

### ユーザーストーリー
- 開発者として、案件ごとにWorkspaceを分けたい。なぜなら、タブとログインが混ざると探す時間と誤操作が増えるから。（F01, F03, F15）
- 開発者として、パスワード管理や開発用の拡張をそのまま使いたい。なぜなら、無いとChromeに戻るから。（F04）
- 開発者として、過去に見たページをキーボードだけで探したい。なぜなら、マウスでの探索は作業を止めるから。（F09, F10）
- 開発者として、使い方を覚えていない機能を、ググる感覚で検索欄から呼びたい。なぜなら、機能が増えても画面を静かに保ちたいから。（F10）
- 開発者として、別のWorkspaceで開いてしまったページを正しいWorkspaceへ移したい。なぜなら、開き直すと手間と取り違えが増えるから。（F17）
- 開発者として、久しぶりに開いたときだけ全体を見渡したい。なぜなら、短い離席のたびにホーム画面を挟むと作業が止まるから。（F11）

### 画面一覧と遷移
- メインウィンドウ: 上端の統合検索欄（F10）＋左パネル（1段目・2段目、F15）＋Webページ表示領域（2段目を畳むと上に最近使ったタブ列）
- Developer Home: Workspace一覧のカード。選ぶとメインウィンドウでそのWorkspaceを開く
- 検索候補の一覧: 統合検索欄の真下に重ねて出し、Escで閉じる（R4）
- 設定: Cmd/Ctrl+, で開く。テーマ、レイアウト、既定値、拡張の管理、開発者モード
- ダウンロード一覧・ブックマーク: 左パネルの2段目に表示（1段目、または統合検索欄の右の切替から）
- エラー画面・権限の確認: Webページ表示領域の中に表示（エラー画面はページを隠した同じ場所。権限の確認は表示領域の上端の細い帯で、その分ページを下げる）

### 機能ごとの受け入れ条件

**F01 Workspace**
- 名前とMode（Production / Development / Testing / Custom）を入力して作成すると、サイドバーに追加され、空のタブが1つ開く。
- 切替は300ms以内に完了する（性能予算）。
- フルアクティブなWorkspaceが6個目になると、最も長く使っていないものがDormantになり、WebContentsViewの実体が破棄される。再度選ぶと、URLとスクロール位置が戻る。
- Dormantが30日続いたものは表示上アーカイブ扱いになる（DB書き込みなし、ADR-011）。
- 削除の前に自動スナップショットを1回作成する。スナップショットは30日で自動的に消す。
- 削除すると、そのWorkspaceのパーティション（Cookie・ストレージ・拡張のデータ）も消す。
- 名前は1〜100文字で、前後の空白は取り除く。
- Workspaceの切り替えショートカット: macOSは Ctrl+1〜9、Windows・Linuxは Alt+1〜9（左パネルの並び順。設定で変更可）。タブの切り替えはChromeと同じ Cmd/Ctrl+1〜9 のまま。

**F02 タブとナビゲーション**
- URL入力で読み込み、戻る・進む・再読み込み・停止ができる。URL以外の文字列は既定の検索エンジンで検索する。
- タブの新規作成（Cmd/Ctrl+T）、閉じる（Cmd/Ctrl+W）、閉じたタブを戻す（Cmd/Ctrl+Shift+T）ができる。
- WebContentsView実体は全Workspace合計で最大30個。超えたら最も長く未フォーカスのタブから破棄し、URLとタイトルだけ残す。再クリックで再生成する。

**F03 ログイン状態の保持**
- 各Workspaceは `persist:workspace-<id>` パーティションを持つ。WorkspaceAでログインしたサイトは、WorkspaceBではログアウト状態で表示される。
- アプリを再起動しても、各Workspaceのログインが保持される。
- Googleアカウントでログインできる（R1の結果次第で条件を見直す）。

**F04 拡張機能**
- Chromeウェブストアのページから拡張を導入できる。
- 開発者モードがONのときだけ、開発中の拡張（フォルダ）を読み込める。読み込み時に「この拡張はウェブストアの審査を経ていません」という警告を表示する。
- 拡張ごとに適用範囲を「全Workspace共通」か「指定したWorkspaceのみ」から選べる。
- 拡張のボタンの位置は、設定で「1段目」「統合検索欄の右」「両方」から選ぶ（既定は1段目、F15）。クリックでポップアップが開く。サイドパネル（sidePanel API）が動く拡張は2段目に表示する（R2の結果次第）。
- パスワード管理の拡張は、拡張単体（マスターパスワード入力）で自動入力できれば合格とする。デスクトップアプリとの連携はMVPの対象外。
- 動作しないAPIを使う拡張は、管理画面に「この拡張はTruefulでは一部動きません」と表示する。

**F05 内蔵広告ブロック**
- 既定でON。設定で全体のON/OFFと、サイトごとの除外ができる。
- 既知の広告テスト用ページで、広告の要求が遮断される（E2Eで確認）。
- 拡張の `chrome.webRequest` と衝突する場合は内蔵広告ブロックを優先し、該当する拡張を管理画面で「一部動きません」と表示する（R5）。

**F06 PDF閲覧**
- PDFのURLとローカルのPDFファイルを、ダウンロードせずにタブ内で表示できる。拡大・ページ内検索・印刷ができる。

**F07 ダウンロード管理**
- ダウンロードは `~/Downloads/Trueful/<Workspace名>/` に保存する。Workspace名にファイル名として使えない文字（`/ \ : * ? " < > |` 等）が含まれる場合は `_` に置き換える。同名ファイルは ` (1)` のように連番を付ける。
- 左パネルの2段目で進捗・完了・失敗を表示し、一時停止・再開・取り消し・フォルダで表示ができる。再開はアプリを起動している間だけで、再起動の前に終わらなかったダウンロードは「中断」として表示する。

**F08 ブックマーク**
- Chromeのローカルの `Bookmarks` ファイル（プロファイル内のJSON）から、フォルダ構造ごと取り込める。見つからない場合は、ChromeでエクスポートしたHTMLファイルから取り込める。
- 取り込み結果（件数、失敗件数）を表示する。
- ブックマークは左パネルの2段目と、統合検索欄の候補に表示する。追加（Cmd/Ctrl+D）・編集・削除ができる。

**F09 閲覧履歴**
- 訪問したURL・タイトル・時刻・Workspaceを保存する。既定の保存期間は90日で、設定で変更できる。期限を過ぎたものは起動時に削除する。
- 統合検索欄で、タイトルとURLを対象に検索できる。
- 履歴の全削除と期間指定の削除ができる。

**F10 統合検索欄**
- 上端の欄1つで、URLの入力、Web検索、開いているタブ・履歴・ブックマーク・Workspace・Truefulの操作の候補を出す。Cmd/Ctrl+L または Cmd/Ctrl+K で欄にフォーカスする。
- 入力から16ms以内に候補を更新する（性能予算）。候補の一覧は欄の真下に出す（R4）。
- 候補の並び: その場の答え → 近道 → Truefulの操作 → 今のWorkspaceのタブ・履歴・ブックマーク → 他のWorkspaceの候補（Mode色の印付き） → Web検索。
- Truefulの操作は、正式名に加えて言い換えの語で見つかる（例: 「キャッシュを消去」に「キャッシュ、削除、消す、クリア、cache、重い」）。言い換えの語は操作の定義ファイルに一緒に書く。
- その場の答え（MVP）: Unix時刻と日時の相互変換、四則演算、色コードのプレビュー、Base64とURLエンコードの変換、UUIDの生成。選ぶと結果をクリップボードにコピーする。
- 開発者向けの近道（MVP）: 1〜65535の数字だけで `http://localhost:<番号>`、`gh <語>` でGitHub、`npm <語>` でnpm、`mdn <語>` でMDN。近道は設定で追加・削除できる。
- マウスを使わずに、選択・実行・閉じるまで完結する。

**F11 起動時の復元とDeveloper Home**
- 前回の終了から「Developer Homeまでの時間」（既定1時間、設定可）以内なら、前回のWorkspaceとタブを復元する。
- それを超えていたらDeveloper Homeを表示する。
- 設定で「Developer Homeを表示しない」にすると、常に前回の状態を復元する。
- コールドスタートからの表示は2秒以内（性能予算）。

**F12 クラッシュからの復元**
- 異常終了の後の起動では、「前回のWorkspaceとタブを復元しますか」と確認してから復元する。
- DBが壊れていたら、壊れたファイルを残して、起動時のバックアップから戻し、知らせる。バックアップがない・バックアップも壊れていたら、新しく作り、以前のWorkspaceが一覧に出ないことを強く知らせる（壊れたファイルは残す）。
- 同じ保存場所で起動できるのは1つだけ。2つ目の起動は、DBに触れずに終わり、1つ目のウィンドウを前に出す（異常終了の判定 `clean_exit` を壊さないため）。
- ADR-012の3パターン（JSON読取不可、必須フィールド欠損、参照ファイル消失）をそれぞれ再現するテストがある。

**F13 更新通知**
- 起動時と24時間ごとに、GitHub Releasesの最新版を確認する。
- Windows（NSIS）とLinux（AppImage）は、ダウンロードして再起動時に適用する。
- macOSは署名なしで自動更新できないため、新しい版があることを通知し、ダウンロードページを開く。

**F14 設定**
- テーマ（OSに合わせる / ライト / ダーク、既定はOSに合わせる）、拡張の配置（3方式）、2段目の開閉、最近使ったタブ列の枚数、近道、Workspace切替のショートカット、Developer Homeまでの時間、履歴の保存期間、広告ブロック、開発者モード、Sentryの送信（既定OFF）。
- すべての設定は `settings.json` にも書き出され、手で編集しても反映される（Everything Configurable）。

**F15 左パネルとレイアウト**
- 左端の1段目（幅48px）: 一番上に現在のWorkspaceの頭文字とMode色、その下にタブ・ブックマーク・ダウンロードの切替、区切り線の下によく使う拡張。
- 2段目: 1段目で選んだものの中身。タブ一覧は今のWorkspaceだけ展開し、他のWorkspaceは名前の行だけ（クリックで切り替え）。階層はWorkspaceとタブの2段まで。
- 破棄済みのタブは、並びを変えずに薄い色と休止マークで表示する。
- 拡張の配置3方式（設定、既定は「1段目」）:
  - 1段目: 左は1段目＋2段目
  - 統合検索欄の右: 左は2段目だけ。拡張と、タブ・ブックマーク・ダウンロードの切替を統合検索欄の右に置き、現在のWorkspaceの色を欄の左端に出す
  - 両方: 左は1段目＋2段目。統合検索欄の右にも拡張を出す
- Cmd/Ctrl+Bで2段目を畳む・開く。ウィンドウ幅が960px未満になったら自動で畳む。どの状態でも、現在のWorkspaceの名前または頭文字とMode色が見えている。
- 最近使ったタブ列: 2段目を畳んでいるときだけ、Webページの上に今のWorkspaceの最近使ったタブを最大5枚（最後に見た順、枚数は設定で変更可）並べる。×でタブを閉じる。
- 選択中のハイライトはグレー系のトーンを使い、Blueは使わない（BlueはProductionのMode色専用）。
- 方式の変更や2段目の開閉の前後で、Webページ表示領域の位置とサイズが1フレーム以内に更新され、ページがちらつかない。

**F16 サイトの権限とエラー画面**
- カメラ・マイク・通知・位置情報などの要求は、確認を出し、結果をWorkspaceとサイトの組ごとに記憶する。設定から取り消せる。
- 読み込み失敗、オフライン、証明書エラーは、それぞれ原因と次の操作（再読み込み、戻る）を書いた画面を表示する。証明書エラーは既定で先に進めない。

**F17 タブを別のWorkspaceへ移動**
- タブの右クリックメニュー「Workspaceへ移動」で移動先を選ぶと、移動先に同じURLのタブが開き、元のWorkspaceからは消える。
- 移動先はCookieが別なので、ログイン状態が変わることを移動時に表示する（「今後表示しない」を選べる）。
- 移動先がDormantなら、復帰させてから開く。

### エッジケースとエラー時の挙動
| 場面 | 挙動 |
|---|---|
| Workspaceが0個 | 最初のWorkspaceを作る画面を表示（オンボーディングの代わりの最小画面） |
| 大量の履歴（10万件） | 統合検索欄の候補がインデックスで16ms以内に返る |
| 同名のWorkspace | 作成を許可し、内部はIDで区別。ダウンロードフォルダは `名前 (ID)` にする |
| 作成・削除の二重操作 | ボタンは処理中に再実行を受け付けず、完了まで進捗を表示 |
| 取り込み中にアプリ終了 | 取り込みは1トランザクション。途中で終わったら何も反映しない |
| オフライン | エラー画面を表示し、復帰時に再読み込みを提案 |
| 拡張がクラッシュ | 該当拡張だけ無効化し、管理画面に理由を表示。ブラウザ本体は継続 |
| メモリが2GBを超えた | 警告を表示し、Dormantにできるもの一覧を出す |

## 6. データ

### 保存する項目
| 保存先 | 内容 |
|---|---|
| SQLite `workspace` | id、name、mode、status（active/dormant）、position、last_used_time_ms、dormanted_time_ms、created_time_ms |
| SQLite `tab` | id、workspace_id、url、title、position、scroll_y、last_active_time_ms |
| SQLite `history_url` | id、workspace_id、url、title、visit_count、last_visited_time_ms（URLごとに1行。全文検索の索引 `history_url_fts`） |
| SQLite `history_visit` | id、url_id、visited_time_ms（訪問1回ごとに1行） |
| SQLite `app_state` | last_workspace_id、last_quit_time_ms、clean_exit（1行だけ。F11・F12の判定） |
| SQLite `bookmark` | id、parent_id、kind（folder/url）、title、url、position、created_time_ms（全 Workspace で共有。索引 `bookmark_fts`） |
| SQLite `download` | id、workspace_id、url、path、state、received_bytes、total_bytes、started_time_ms、ended_time_ms |
| SQLite `extension_scope` | extension_id、scope（all/selected）。selected の Workspace は `extension_scope_workspace`（extension_id、workspace_id） |
| SQLite `site_permission` | workspace_id、origin、permission（camera・microphone・notifications など）、decision（allow/deny）、decided_time_ms |
| SQLite `workspace_manifest_backup` | workspace_id、manifest_json、sha256、updated_time_ms（マニフェストの写しとSHA256、ADR-012） |
| SQLite `workspace_snapshot` | id、workspace_id、snapshot_json、created_time_ms（削除前の自動スナップショット、F01） |
| JSON | WorkspaceごとのCOMマニフェスト `{ id: number }`（`userData/workspaces/<id>/com.json`、ADR-013）、`settings.json`。USER側のjsonはPhase 2（Git連携）で足す |
| Electronのセッション | Cookie、ストレージ、拡張のデータ（パーティションごと） |

命名はSQLiteがsnake_case、TypeScriptがcamelCase。スキーマ変更はバージョン付きのマイグレーションで行う。列の型・制約・索引・マイグレーションの手順は `docs-ja/architecture/data-schema.md` を正とする。

### エクスポート・削除・バックアップ
- ブックマークはHTML形式でエクスポートできる。
- 履歴、Cookie、キャッシュは、Workspace単位または全体で削除できる。
- SQLiteは起動時にバックアップを1世代作成し、JSON破損時の復元元にする（ADR-012）。
- 個人情報: 履歴とCookieは端末内だけに保存し、外部に送らない。ログに入力内容・Cookie値・認証情報を残さない（既存のログ仕様）。

## 7. 非機能要件

### 性能（既存の性能予算を引き継ぐ）
| 項目 | 目標 |
|---|---|
| コールドスタートから表示まで | 2秒以内 |
| Workspace切替 | 300ms以内 |
| 統合検索欄の候補更新 | 16ms以内 |
| メモリ（アクティブWorkspace1つ） | 300MB目安 |
| メモリ（全体の警告ライン） | 2GB |
| 最低動作環境 | メモリ8GB |

「軽い」は上記の体感速度とメモリ上限で定義する。インストールサイズは対象外。

### セキュリティ（想定脅威と対策）
| 脅威 | 対策 |
|---|---|
| 悪意あるWebページがIPC経由でMainを操作する | Rendererは `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。preloadは用途別の関数だけを公開し、`ipcRenderer` をそのまま渡さない。IPCの引数は受信側で型を検証する |
| 悪意ある拡張がWorkspaceを越えてデータを読む | 拡張の適用範囲をWorkspace単位で制御。開発中の拡張は開発者モードでのみ読み込み、警告を出す |
| Electron・Chromiumの既知の脆弱性 | 新メジャー公開から4週間以内に追従 |
| 依存ライブラリの汚染 | ロックファイルを固定し、CIで `pnpm audit` を実行。新しい依存の追加はるりあの承認が必要 |
| 配布ファイルの改ざん | GitHub ReleasesにSHA256のハッシュ値を掲載し、READMEに確認方法を書く |

既存の `security/threat-model.md`（前のリポジトリにあり、未取り込み）を取り込んだうえで、上記を追記する。

### アクセシビリティ
- ブラウザ自体のUIはキーボード操作だけで完結する。
- 文字のコントラストはWCAG 2.1 AA以上。状態は色だけでなくアイコンでも示す。
- 独自コンポーネントにARIAのロールとラベルを付ける。
- OSの「視差効果を減らす」がONならアニメーションを止める。

### 多言語
MVPは日本語UIのみ。文字列は最初から辞書ファイル経由で表示し、英語追加時に文字列を探して回らなくて済む構造にする。

### 法令・規約・OSS
- ライセンス: GPL-3.0（`electron-chrome-extensions` がGPL-3.0のため）。本リポジトリに LICENSE を置いた（2026-09-27）。前のリポジトリのコードは引き継いでいないため、メンバーの同意は不要と、るりあが判断した。
- 脆弱性の報告先: GitHubのPrivate vulnerability reporting。`SECURITY.md` に明記する。
- READMEに開発体制（実装はClaude Code、設計と監査はるりあ）を明記する。方針転換はQiitaの新しい番外編で説明する。
- コントリビュート方針: 共同開発保留中のため、MVPまでは外部からのPRを受け付けず、Issueのみ受け付ける。`CONTRIBUTING.md` に明記する。

### 運用
- クラッシュレポート: Sentry、オプトイン・既定OFF、送信内容を事前に表示。
- ログ: 7日保持、50MB上限、PIIは送信時にスクラビング。
- 利用統計: 収集しない。

## 8. デザイン

### 方向性
Design System v1.1を引き継ぐ（8pxグリッド、JetBrains Mono、Meiryo、色は意味で装飾ではない、Attention Economy）。密度はゆったり（余白多め）。テーマはライト・ダーク選択式、既定はOSに合わせる。

### 採用した案と理由
VS Codeに倣い、左端の1段目（アクティビティバー）と2段目（パネル）の構成を採用。畳んだときの表示、ダウンロードとブックマークの置き場所、拡張の置き場所が1つの構造で解決し、現在のWorkspaceを常に1段目に出せるため。拡張の配置は3方式から選べる（F15）。Command Paletteは作らず、上端の統合検索欄を唯一の入口にする（ADR-015）。

### 主要画面のワイヤー
```
+--+---------------------------------------------------------+
|  統合検索欄（URL・検索・タブ・履歴・操作・その場の答え）      |
+--+-----------------+---------------------------------------+
|T | Trueful開発     |                                       |
|--|   GitHub        |                                       |
|≡ |   Electron docs |              Webページ                |
|★ |   ◌ MDN（破棄） |                                       |
|↓ | ▸ 案件B         |                                       |
|--| ▸ 調べもの      |                                       |
|拡|                 |                                       |
+--+-----------------+---------------------------------------+
T = 現在のWorkspaceの頭文字＋Mode色 / ≡★↓ = タブ・ブックマーク・DLの切替 / 拡 = よく使う拡張
2段目を畳むと、Webページの上に「最近使ったタブ列」が出る
```

### コンポーネントと状態
| コンポーネント | 状態 |
|---|---|
| ActivityBar（1段目） | 表示、非表示（方式「統合検索欄の右」） |
| CurrentWorkspaceBadge | 常時表示（頭文字＋Mode色。方式「統合検索欄の右」では欄の左端） |
| SidePanel（2段目） | タブ、ブックマーク、ダウンロード、拡張のサイドパネル、畳み中 |
| WorkspaceRow | 今のWorkspace（展開）、他（名前のみ）、Dormant |
| TabItem | 通常、選択中（グレー系）、読み込み中、破棄済み（薄い色＋休止マーク）、音声再生中 |
| RecentTabsStrip | 非表示（2段目が開いている）、表示（最大5枚） |
| OmniBox（統合検索欄） | 通常（URL表示）、入力中、候補あり、候補なし（Web検索のみ）、証明書エラー |
| SuggestionPopup | 非表示、表示（その場の答え・近道・操作・タブ・履歴・検索） |
| ExtensionButtons | 1段目、統合検索欄の右、両方、一部非対応 |
| WebViewport | 読み込み中、表示済み、読み込み直し中、エラー画面、オフライン、権限確認 |
| DeveloperHome | Workspaceあり、Workspace 0個（作成画面） |
| DownloadsView | 空、進行中、完了、失敗 |
| MoveTabMenu | 移動先の一覧、ログイン変化の告知 |
| Settings | 通常、`settings.json` の読み込みエラー（既定値で起動し通知） |
| UpdateNotice | 非表示、更新あり（mac: ページを開く / Win・Linux: 再起動で適用） |
| CrashRestorePrompt | 表示、復元中、復元失敗（ADR-012のパターン別） |

### レスポンシブ
ウィンドウ幅960px未満で2段目を自動で畳む。最小ウィンドウ幅は640px。

### ネイティブ固有の要件
- macOS: 未署名のため、初回起動時の警告の回避方法をREADMEに書く。メニューバーはOSの作法に従う。
- Windows: SmartScreenの警告の回避方法をREADMEに書く。
- Linux: AppImageで配布する。

## 9. 検証

### テスト方法
| 種別 | 対象 | ツール |
|---|---|---|
| 単体 | services（Workspace計算、名前の無害化、履歴の期限切れ判定など） | Vitest |
| IPC | Renderer↔Mainの各チャネル（型検証を含む） | Vitest＋IPCモック |
| E2E | 1章のシナリオ、F01〜F17の受け入れ条件。F15は拡張の配置3方式×2段目の開閉の6通りで実行 | Playwright（Electron） |
| 性能 | 起動・切替・検索候補の更新 | Playwrightで計測し、予算超過でCIを失敗させる |

### 実行コマンド
```
pnpm install
pnpm typecheck
pnpm lint
pnpm test          # Vitest（単体・IPC）
pnpm test:e2e      # Playwright
pnpm build:unpack  # 動作確認用のビルド
```

### end-to-end の確認手順（監査チェックリスト）
各PRには、るりあが判定できる形で次を添える: 何を変えたか（3行以内）、受け入れ条件ごとの合否、スクリーンショットまたは短い動画、実行したコマンドと結果、「るりあ向けの解説」（Pythonで言うと何に当たるか、なぜこう書いたか）、実装とは別のClaude Codeセッションによるレビュー結果。PRの差分は300行以内（テストとロックファイルを除く）。るりあが精読するのはIPC・セキュリティ設定・DBスキーマの3か所で、UIは動画で確認する。
MVP完成時の監査チェックリスト:
- [ ] 1章のシナリオ1〜3を手で再現できる
- [ ] F01〜F17の受け入れ条件をすべて満たす
- [ ] 3OSのCIがすべて通る
- [ ] 性能予算をすべて満たす
- [ ] R1〜R6の試作結果と対応がSPECに反映されている
- [ ] LICENSE、SECURITY.md、CONTRIBUTING.md、READMEの開発体制が揃っている

### 完了の定義
3章の「完成の定義」と同じ。

## 10. 開発ルール

### ディレクトリ構成
```
app/src/
  main/
    index.ts
    shared/types.ts          # Main側の共有型
    <feature>/services/      # 単機能の部品（UIへの通知はしない）
    <feature>/flows/         # 進行役（servicesを組み合わせる）
    ipc/                     # チャネル定義と引数検証
    db/                      # スキーマとマイグレーション
  preload/index.ts           # 用途別の関数だけ公開
  renderer/src/              # React
spikes/                      # 試作（R1〜R5、T1-3a）。本体に import しない
docs-ja/ docs-en/            # 設計文書（2026-09-27 時点で取り込んだのは docs-ja/architecture/ だけ。残りは前のリポジトリにある）
```

### コードスタイル（例）
```ts
// services: 純粋関数を優先し、失敗は独自エラーで包む
export function sanitizeFolderName(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '_').trim() || 'workspace'
}
```
- SQLiteはsnake_case、TypeScriptはcamelCase。
- ファイル書き込みはアトミック（tmp→rename、ADR-014）。

### Git運用
- `main` は常に動く状態。作業は `feat/F01-workspace-create` のようにタスク単位のブランチ。
- 1タスク1PR。PRテンプレートに受け入れ条件の合否を書く。
- マージはるりあだけが行う。

### 境界線
- 常にやる: テストを書いてから実装する。PRに受け入れ条件の合否とスクリーンショットを付ける。SPECと食い違う変更をしたらSPECの更新もPRに含める。
- 先に確認: 新しい依存の追加、SQLiteスキーマの変更、IPCチャネルの追加・変更、ADRと異なる判断、セキュリティ設定（sandbox等）の変更。
- 絶対やらない: 自分でPRをマージする。300行を超える差分を1つのPRにする。`contextIsolation` や `sandbox` を無効にする。秘密情報をコミットする。テストを消して通す。

## 11. 決定ログと未決事項

### 決定と理由（今回）
| 決定 | 理由 |
|---|---|
| 実装はClaude Code、るりあは設計と監査 | 仕様量に対して手書き実装の体制が釣り合わないため |
| 共同開発は保留 | 実装の主体が変わり、メンバーの役割が定まらないため |
| 拡張機能をMVPへ前倒し（ADR-006改訂） | メインブラウザ化に複数の拡張が必須のため |
| 拡張の適用範囲は拡張ごとに選択（ADR-006改訂） | パスワード管理は共通、開発用は特定Workspace、と使い分けるため |
| BrowserView→WebContentsView（ADR-008改訂） | BrowserViewが非推奨のため |
| Electron 39→44、4週間以内に追従 | 39はセキュリティ修正の対象外のため |
| 広告ブロックは内蔵 | MV3拡張の不安定さを避けるため |
| パスワードは保存しない | 拡張と管理アプリに任せ、保管庫を攻撃対象にしないため |
| macOSは更新通知＋手動DL | 署名なしでは自動更新できず、0円方針を優先 |
| ライセンスはGPL-3.0 | 拡張ライブラリがGPL-3.0のため |
| MVPから英語UI・オンボーディング・Inspector Bar・Tier Aツールを外す | MVPの合格ラインに不要なため |
| Command Paletteを作らず、統合検索欄に集約（ADR-015） | 必要なのは「画面に出ていない機能に名前で届く入口」で、ユーザーは分からないとき検索欄に打つ（ググる）ため |
| Tier Aツールの一部を統合検索欄の「その場の答え」で提供 | 専用画面なしで提供できるため |
| 左パネルを1段目・2段目の構成に（VS Code型） | 畳んだときの表示、DL・ブックマーク・拡張の置き場所を1つの構造で解決するため |
| 拡張の配置は3方式から選択、既定は1段目 | 好みが分かれるため。VS Codeに倣い1段目を既定に |
| 最近使ったタブ列は2段目を畳んだときだけ表示 | 左の一覧との重複を避けるため |
| 選択色はグレー系、BlueはProduction専用 | 本番Workspaceの取り違えを防ぐため |
| パスワード管理は拡張単体で動けば合格 | Electronがネイティブメッセージングに対応していない可能性が高いため |
| 内蔵広告ブロックを拡張の `chrome.webRequest` より優先 | 必須の拡張は通信を書き換えない種類で、影響が小さいため |
| SQLiteは `node:sqlite`（ADR-002改訂、2026-09-28） | T1-3aでbetter-sqlite3と速さ・手間が同じで、依存をゼロにできるため |
| データ構造を `data-schema.md` に確定（2026-09-28） | 型・外部キー・索引・バックアップの世代（ADR-012の未決事項）を実装の前に決めるため |

### 却下した案
Tauri、Chromiumフォーク、Firefoxフォーク（条件付き保留）、MIT/MPLライセンス、横タブ、Truefulのパスワード保存、uBlock拡張での広告ブロック、Command Palette（下部パネル・専用UI）、破棄済みタブの別まとまりへの移動。

### 未決事項と期限
| 事項 | 担当 | 期限 |
|---|---|---|
| R1失敗時の合格ラインの見直し | るりあ | 試作（M0）の直後 |
| R2で動かない拡張の代替 | るりあ（Claudeが案を出す） | 試作（M0）の直後 |
| AI開示方針の番外編 | るりあ | MVP公開の前 |
| TypeScript 7への移行時期 | るりあ | M1完了時に再確認 |
| 統合検索欄の操作と言い換え語の初期セット | るりあ（Claudeが案を出す） | T4-1bの前 |

## 12. 用語集
| 用語 | 定義 |
|---|---|
| Workspace | タブ・ログイン・拡張の適用・ダウンロード先をまとめる作業単位。独自のセッションパーティションを持つ |
| Mode | WorkspaceのSecurityProfile（Production/Development/Testing/Custom）。色で表示する |
| Dormant | Workspaceの休止状態。画面の実体を破棄し、マニフェストとディスク上のデータだけ残す |
| アーカイブ | Dormantが30日続いたWorkspaceの表示上の扱い |
| Developer Home | Workspace一覧を見渡す起動画面 |
| 畳む | 2段目を閉じ、1段目だけにした状態 |
| 統合検索欄 | 上端の検索欄。URL・Web検索・タブ・履歴・ブックマーク・Workspace・Truefulの操作・その場の答え・近道の入口 |
| 1段目 / 2段目 | 左パネルの構成。1段目は切替と拡張のアイコン列、2段目はその中身 |
| 最近使ったタブ列 | 2段目を畳んだときだけWebページの上に出る、最近使ったタブの列 |
| 破棄済みのタブ | メモリ節約のためページの中身を捨てたタブ。一覧に残り、押すと読み込み直す |
| 開発者モード | 開発中の拡張の読み込みなど、上級者向けの機能を有効にする設定 |
| 監査 | るりあがPRの受け入れ条件・動作・差分を確認し、マージを判断すること |
| unpacked | ストアを経由しない、フォルダから読み込む開発中の拡張 |
