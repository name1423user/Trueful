# T0-5 広告ブロックと拡張の共存の試作（R5）結果

目的: `@ghostery/adblocker-electron`（`session.webRequest` を使う）と `electron-chrome-extensions` を同時に使えるか確かめる。

コードは T0-2 の試作（`spikes/extensions/`）に `--adblock=off|before|after` を足す形にした。同じ190行を複製しないため。このフォルダには結果だけを置く。

## 1. 環境
| 項目 | 値 |
|---|---|
| 実施日 | |
| 実施者 | |
| OS / CPU | |
| Electron / Chromium | （起動時のログ `[spike] versions:` を転記） |
| ライブラリの版 | `@ghostery/adblocker-electron@2.18.2`、ほかは T0-2 と同じ |

## 2. 手順

### 準備
1. T0-2 の準備（RESULT.md の手順1〜3）を済ませる。`@ghostery/adblocker-electron` は `spikes/extensions/package.json` に入っている。
2. T0-2 の手順2で、1Password・Bitwarden・React Developer Tools・翻訳拡張を入れておく。

### 起動モード
| モード | コマンド | 広告ブロック |
|---|---|---|
| なし | `pnpm --dir spikes/extensions start:unpacked` | 無効 |
| 拡張の前 | `pnpm --dir spikes/extensions start:adblock-before` | 拡張を読み込む前に有効にする |
| 拡張の後 | `pnpm --dir spikes/extensions start:adblock-after` | 拡張を読み込んだ後に有効にする |

- 3つとも hello 拡張（unpacked）を読み込む。hello 拡張は、`chrome.webRequest.onBeforeRequest` が呼ばれた回数をツールバーのバッジに出す。
- 遮断した要求は、ホストごとに1回だけ `[spike] 遮断: <ホスト>` とターミナルに出る。

### 確認（3つのモードそれぞれで）
1. モードのコマンドで起動し、`[spike] 広告ブロック` の行を控える。
2. タブ A の URL 欄に `d3ward.github.io/toolz/adblock` を入れて開き、表示された点数を控えて Cmd/Ctrl+S を押す。
3. 同じページを開いたまま、hello のバッジの数字を控える（`ok` のままなら、`chrome.webRequest` が呼ばれていない）。
4. T0-2 の手順3の主要操作（自動入力、Components パネル、翻訳）をタブ A で繰り返す。
5. Bitwarden が入っていれば、Basic 認証のページ（例: `https://httpbin.org/basic-auth/user/pass`）で、Bitwarden の自動入力が出るかを確かめる（Bitwarden は `chrome.webRequest.onAuthRequired` を使う）。
6. Cmd/Ctrl+2 でタブ B に切り替え、手順2を繰り返す（B で広告ブロックが効くか）。

## 3. 結果
記号: ◯ 動く / △ 条件付きで動く / × 動かない / － 未実施

| 確認項目 | なし | 拡張の前 | 拡張の後 | 証拠 |
|---|---|---|---|---|
| 広告テストページの遮断（タブ A） | | | | |
| 広告テストページの遮断（タブ B） | | × | × | 起動ログ（4章） |
| hello の `chrome.webRequest` が呼ばれる | × | × | × | 付記 |
| 1Password の自動入力 | | | | |
| Bitwarden の自動入力（通常・Basic 認証） | | | | |
| React DevTools の Components パネル | | | | |
| 翻訳 | | | | |

## 4. 所見
- **Ghostery は2つめのセッションで有効にできない。** `enableBlockingInSession` がセッションごとに `ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', …)` を登録するため、2つめで `Attempted to register a second handler` になり、そのセッションでは遮断も効かない。Workspace ごとにセッションを分ける Trueful では、そのままでは使えない。対策の候補: 見た目の遮断（cosmetic filters）の IPC を自前で1回だけ登録する、ネットワークの遮断だけを各セッションの `webRequest` に自分でつなぐ、など。
- **拡張の `chrome.webRequest` は、広告ブロックがなくても呼ばれなかった。** 追加の調査（[webrequest-probe の報告](../webrequest-probe/RESULT.md)）で原因を切り分けた。Electron 44 は、MV3 の拡張（service worker）に `chrome.webRequest` のイベントを届けない（ライブラリやセッションと関係なく 0 件）。MV2 の拡張（background page）には届き、Ghostery を有効にすると 0 件になった。R5 の仮説（`session.webRequest` による上書き）は、MV2 で確かめられた。
- `session.webRequest` は、イベントごとにリスナーを1つしか持てない（Ghostery のソースのコメントでも確認）。Ghostery は `onBeforeRequest` と `onHeadersReceived` を使う。本体で別の用途（ログなど）に同じイベントを使うと、どちらかが上書きされる。
- Ghostery 自体の遮断は動いた。タブ A で `play.google.com`（ウェブストア）と `en.wikipedia.org`（ウィキペディア上の要求）への要求を遮断した。

## 5. 推奨
（実機の結果を見てから記入: 続行 / 合格ラインの見直し / 代替案）

## 付記: 開発環境での起動確認（2026-09-27、Claude Code）
- macOS（darwin-arm64、Electron 44.4.5 / Chromium 152.0.7977.130）で、3つのモードを `reset` してから起動した。起動後に DevTools のプロトコルでタブ A を `example.com` → `en.wikipedia.org` に移動させ、hello 拡張の service worker で `chrome.storage.local` の値を読んだ。
- 3つのモードすべてで、`webRequestSeen` は記録されなかった（リスナーが呼ばれていない）。同じ service worker からの `chrome.storage.local.set` とバッジの変更は反映された。
- 「拡張の前」「拡張の後」の両方で、B は `有効にできない: Attempted to register a second handler for '@ghostery/adblocker/inject-cosmetic-filters'` になった。
- 注意: unpacked の拡張の `background.js` を書き換えると、古い service worker が動き続けることがある。`session.clearData()` では消えず、保存場所（userData）を丸ごと消す必要がある（[調査](../webrequest-probe/RESULT.md) 2章）。この付記の hello の結果も古い版を測っていた可能性があるが、調査で測り直した結論は同じだった。
