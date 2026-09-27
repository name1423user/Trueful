# 引き継ぎ書: M0 試作（T0-1〜T0-5）

- 作成: 2026-09-27 12:35 JST（クラウドの Claude Code セッションから、実機の Claude Code へ）
- 前のセッション: https://claude.ai/code/session_01BxN96AsQnDj9xtEP5kAphh
- この文書の置き場所: ブランチ `claude/m0-spikes-plan-9gqrx3`（T0-1 の PR の差分を汚さないため）。役目を終えたら消してよい。

## 1. 最初に読むもの
1. `CLAUDE.md`、`SPEC.md`、`PLAN.md`（M0 の節）
2. ブランチ `feat/T0-1-google-login` の `spikes/README.md`、`spikes/RESULT-TEMPLATE.md`、`spikes/google-login/`（試作の書き方の見本）
3. この文書

## 2. るりあの好み・決まりごと
- 話し合いのたびに、最初に現在時刻を取得して書く（`TZ=Asia/Tokyo date`）。
- 計画を出して承認を得てから実装する。M0 全体の計画は承認済み（下の3章）。

## 3. 承認済みの決定（2026-09-27 12:29〜12:30 JST、「いい感じ」で承認）
1. SPEC 10章の `spikes/  # 試作（R1〜R3）` を「R1〜R5、T1-3a」に直す → T0-1 のブランチで対応済み。
2. ブランチはタスクごとに `feat/T0-x-<名前>`（1タスク＝1PR）。
3. 依存の追加を承認済み（版は完全に固定）: `electron@44.4.5`（全部）、`electron-chrome-extensions@4.9.0`・`electron-chrome-web-store@0.13.0`（T0-2・T0-5）、`@ghostery/adblocker-electron@2.18.2`（T0-5）、`cross-fetch`（T0-5 で必要なときだけ）。これ以外は入れる前に確認する。
4. SPEC 3章のリスク表に「試作の結果」の列を足す → 対応済み。各試作は自分の行の最後の列だけを更新する。
- 実機での手順の実行は、るりあが行う（Google ログイン、拡張の導入など）。
- サブエージェントでの並列実行も許可されている（T0-2 と T0-3 を投げかけたところで中断。何も作られていない）。

## 4. 進み具合
| タスク | ブランチ | 状態 |
|---|---|---|
| T0-1 Google ログイン（R1） | `feat/T0-1-google-login`（push 済み、PR はまだない） | 試作と手順書はできた。実機での確認待ち |
| T0-2 拡張機能（R2） | 未作成 | 未着手 |
| T0-3 PDF（R3） | 未作成 | 未着手 |
| T0-4 検索候補の重ね表示（R4） | 未作成 | 未着手 |
| T0-5 広告ブロックと拡張（R5） | 未作成 | 未着手（T0-2 に依存） |

### T0-1 でやったこと（commit 2237513）
- `spikes/google-login/`: BaseWindow と WebContentsView が1枚の最小アプリ。
  - UA の3モード: `start`（素）、`start:strip`（`Electron/` を除く）、`start:chrome-like`（アプリ名も除く、任意）。モードごとにパーティション `persist:spike-google-<モード>` を分けている。
  - `reset` で全モードのログイン状態を消す。
  - メニューのショートカット: Cmd/Ctrl+1 ログイン、Cmd/Ctrl+2 マイアカウント、Cmd/Ctrl+S スクリーンショット（`screenshots/raw/`、git には入らない）。
  - `webRequest` から見える User-Agent と `Sec-CH-UA` をログに出す。
- `RESULT.md`: 手順と空の結果表。
- `spikes/README.md`、`spikes/RESULT-TEMPLATE.md`、`spikes/.gitignore`（`node_modules/`、`**/screenshots/raw/`）。
- SPEC: 3章の表に列を追加し、10章のコメントを修正した。
- 差分は 277 行（ロックファイルを含む）。

### T0-1 の残り
1. 実機（M1 Mac）で `pnpm --dir spikes/google-login install` → RESULT.md の手順どおりに A → B（→ C）を実行する。
2. 結果表・送信ヘッダー・所見・推奨を記入し、メールアドレス等を塗りつぶしたスクリーンショットを `screenshots/` に置く。SPEC 3章の R1 行の最後の列を更新する。
3. PR を作る（PR 本文の型は CLAUDE.md のとおり）。結果が空欄のうちに先に PR を作るかどうかは、まだ決まっていない → るりあに確認する。
4. 別のセッションでレビューする。

## 5. 残りのタスクの計画（承認済みの内容の要約）
共通の書き方（T0-1 に合わせる）:
- 独立した pnpm パッケージにする。`"type": "module"`、`main.mjs`（ビルドなし）、`"pnpm": {"onlyBuiltDependencies": ["electron"]}`。
- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- userData の保存場所を固定し、起動時に `[spike] versions:` を出す。ファイル書き込みは tmp → rename。
- 結果は RESULT-TEMPLATE の型で書き、SPEC の自分の行を更新する。
- ブランチは `feat/T0-1-google-login` から切る（T0-1 がマージされていれば main から）。
- 差分は300行以内。

- **T0-2 `spikes/extensions/`**
  - パーティション A・B の2タブを持つ最小のブラウザ。両方のセッションに ElectronChromeExtensions と installChromeWebStore を入れる。`--load-unpacked=<dir>` でフォルダから読み込む。拡張のボタンは `<browser-action-list>` で出す。
  - 表にすること: 1Password・Bitwarden・React DevTools・翻訳拡張（Google 翻訳、代案は DeepL）について、ストア導入と主要操作（自動入力／Components パネル／翻訳）の可否。unpacked を1つ。A・B の間でログインが共有されるか。ネイティブメッセージング（1Password のデスクトップアプリ連携）。sidePanel。
  - Electron 44 では拡張の API が `session.extensions` に移っているはずなので、ライブラリのソースで確かめる。
  - 300行を超えそうなら、T0-2a（ストア導入・ボタン）と T0-2b（パーティション間の共有・ネイティブメッセージング・sidePanel）に分けることを先に提案する。
- **T0-3 `spikes/pdf/`**
  - `--open=<url|path>` で開き、`--plugins=true|false` を比べる。小さなサンプル PDF を `fixtures/` に置く。
  - 確かめること: URL × ローカル × {表示、拡大、ページ内検索、印刷}。`will-download` が起きて、ダウンロードに回っていないかも見る。
- **T0-4 `spikes/omnibox-popup/`**
  - 上端に入力欄の View、その下にページの View。
  - 方式A `SPIKE_MODE=overlay`: 候補一覧を専用の小さな WebContentsView にし、最後に addChildView して最前面に出す。フォーカスは入力欄に置いたまま、キー操作は Main 経由で伝える。
  - 方式B `SPIKE_MODE=push`: 入力中だけページを固定の高さぶん下げる。
  - 比べる4点: 入力中の候補の更新、上下キーでの選択、Esc で閉じる、ウィンドウの移動・リサイズで位置がずれない。候補の更新にかかった時間もログに出す。
  - Windows では環境変数ではなく CLI 引数で渡す方が確実（T0-1 は `--ua=` 方式にしている）。
- **T0-5 `spikes/adblock-extensions/`**（T0-2 のマージ後）
  - T0-2 に、Ghostery の `ElectronBlocker.fromPrebuiltAdsAndTracking()` を足す。
  - 確かめること: 広告テスト用のページ（例: d3ward.github.io/toolz/adblock）での遮断、T0-2 で動いた拡張の主要操作。有効にする順を入れ替えた場合も試す。
  - 仮説: Electron の `session.webRequest` はイベントごとにリスナーを1つしか持てず、後から登録したものが前のものを上書きする。どの API で上書きが起きたかを記録する。
- **M0 のデモ**: 5つの RESULT.md の「推奨」を1枚の表にまとめ、るりあが SPEC 11章に決定を記録する。

## 6. 注意点・ハマりどころ
- **pnpm の版**: SPEC は pnpm 12、クラウドの環境は pnpm 10 だった。pnpm 10 以降は Electron の postinstall（本体のダウンロード）を初期設定で止めるので、`onlyBuiltDependencies` を入れてある。それでも「Electron failed to install correctly」と出たら、`pnpm approve-builds` を実行するか `node node_modules/electron/install.js` を実行する。pnpm 12 での設定の書き方は未確認。
- **クラウド環境でだけ起きたこと**（実機では関係ない見込み）: Electron 本体のダウンロードがプロキシで途中で切れた。外部の HTTPS は証明書エラーになった。root で動かしたため `--no-sandbox` が必要だった。**`--no-sandbox` をコードやスクリプトに入れてはいけない**。
- **Sec-CH-UA**: クラウドでは最初の要求に `Sec-CH-UA` が出ていなかったが、接続に失敗した要求なので実機で確かめ直す。
- **SPEC の表の競合**: T0-2〜T0-5 を並べて進めると、SPEC 3章の表で隣り合う行を別々のブランチが変えるので、マージのときに競合しやすい。後からマージする側で、自分の行だけを残して解消する。
- **時刻の訂正**: 前のセッションの返答で「12:41 JST」と書いたものがあるが、時刻を取得せずに書いた誤り。実際は 12:30 過ぎ。
