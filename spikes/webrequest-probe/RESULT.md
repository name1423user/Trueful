# 調査報告: 拡張の chrome.webRequest が呼ばれない原因（T0-5 の追加調査）

- 作成: 2026-09-27 14:10 JST（Claude Code）
- きっかけ: T0-5 で、hello 拡張の `chrome.webRequest.onBeforeRequest` が、広告ブロックがなくても一度も呼ばれなかった（[T0-5 の RESULT](../adblock-extensions/RESULT.md)）。

## 1. 結論
1. **Electron 44 では、MV3 の拡張（service worker）に `chrome.webRequest` のイベントが届かない。** ライブラリの有無、セッションの種類（既定 / `persist:`）、広告ブロックの有無のどれを変えても、0件だった。原因は Electron 本体にあり、`electron-chrome-extensions` と `electron-chrome-web-store` のせいではない。
2. **MV2 の拡張（background page）には、`chrome.webRequest` が届く。** 同じページの読み込みで 22 件ずつ届き、ライブラリやセッションの影響はなかった。
3. **R5 の仮説は正しかった。** MV2 の拡張でも、Ghostery（`session.webRequest`）を有効にすると `chrome.webRequest` が 0 件になった。Electron のドキュメントにある「Electron の `webRequest` が `chrome.webRequest` より優先される」のとおり。
4. Chrome ウェブストアの拡張は今は MV3 だけなので、**ストアから入れた拡張の `chrome.webRequest` は、Trueful ではすべて動かない**見込み。広告ブロックとの衝突（R5）より、こちらの方が影響が大きい。

## 2. 方法
- `spikes/webrequest-probe/` に、条件を引数で切り替えられる最小のアプリを作った（`main.mjs`）。`pnpm --dir spikes/webrequest-probe probe` で、下の12通りを順に実行する（`run-matrix.mjs`）。
- 確認用の拡張は MV2 と MV3 の2つ（`fixtures/mv2`、`fixtures/mv3`）。中身は同じで、`webRequest.onBeforeRequest`・`webRequest.onCompleted`・`webNavigation.onCommitted` が呼ばれるたびに `console.log` する。権限は `webRequest` と `<all_urls>`。
- Main は、MV2 の background page の console（`console-message`）と、MV3 の service worker の console（`session.serviceWorkers` の `console-message`）を拾って数える。
- 各回の最初にセッションを `clearData()` で消し、前の回の service worker を残さない。拡張の起動を 1.5 秒待ってから、`https://example.com/` → `https://en.wikipedia.org/wiki/Electron_(software_framework)` の順に開く。
- 環境: macOS（darwin-arm64）、Electron 44.4.5 / Chromium 152.0.7977.130、`electron-chrome-extensions@4.9.0`、`electron-chrome-web-store@0.13.0`、`@ghostery/adblocker-electron@2.18.2`。

## 3. 結果
数字は、そのイベントが呼ばれた回数。「起動」は拡張のスクリプトが動いたこと（全12通りで1）。

| # | 拡張 | ライブラリ | セッション | 広告ブロック | onBeforeRequest | onCompleted | webNavigation |
|---|---|---|---|---|---|---|---|
| 1 | MV3 | なし | persist | なし | **0** | **0** | （API なし） |
| 2 | MV3 | extensions | persist | なし | **0** | **0** | 1 |
| 3 | MV3 | web store | persist | なし | **0** | **0** | （API なし） |
| 4 | MV3 | 両方 | persist | なし | **0** | **0** | 1 |
| 5 | MV2 | なし | persist | なし | 22 | 22 | （API なし） |
| 6 | MV2 | extensions | persist | なし | 22 | 22 | 2 |
| 7 | MV2 | web store | persist | なし | 22 | 22 | （API なし） |
| 8 | MV2 | 両方 | persist | なし | 22 | 22 | 2 |
| 9 | MV3 | なし | 既定 | なし | **0** | **0** | （API なし） |
| 10 | MV2 | なし | 既定 | なし | 22 | 22 | （API なし） |
| 11 | MV3 | 両方 | persist | あり | **0** | **0** | 1 |
| 12 | MV2 | 両方 | persist | あり | **0** | **0** | 2 |

読み取れること:
- 1〜4・9・11（MV3）はすべて 0。ライブラリとセッションは関係ない。
- 5〜8・10（MV2）はすべて 22。ライブラリとセッションは関係ない。
- 8 と 12 の差は広告ブロックだけで、22 → 0 になった。R5 の「上書き」が起きている。
- `webNavigation` は Electron 単体にはなく（`Permission 'webNavigation' is unknown`）、`electron-chrome-extensions` が足している。こちらは MV3 でも届いた（2・4・11）。つまり、MV3 の service worker が動いていないわけではなく、Electron 本体の `chrome.webRequest` のイベントだけが届いていない。

## 4. 外部の情報との照合
- Electron の公式ドキュメント（Supported Extensions APIs）は、`chrome.webRequest` を「All features of this API are supported」としている。MV3 や service worker についての記述はない。今回の結果は、このドキュメントと食い違う。
- 同じドキュメントに「Electron's `webRequest` module takes precedence over `chrome.webRequest` if there are conflicting handlers.」とある。結果の 8 と 12 の差と一致する。
- Electron の issue [#34178](https://github.com/electron/electron/issues/34178)（MV3 の service worker で API が動かない、2022年、閉じている）は、`chrome.runtime` についての報告で、`chrome.webRequest` には触れていない。今回の現象に直接当たる issue は見つけられなかった。

## 5. 影響
- **R2（拡張）**: ストアの拡張が `chrome.webRequest` を使う機能は、広告ブロックと関係なく動かない。どの機能が使っているかは拡張ごとに違う。例として、Bitwarden は Basic 認証の自動入力に `webRequest.onAuthRequired` を使うとされる（未確認）。T0-2 の実機確認で、拡張ごとに影響を見る。
- **R5（広告ブロック）**: MV3 の拡張には、もともと `chrome.webRequest` が届かない。そのため、広告ブロックを入れても、MV3 の拡張が新たに困ることはない。MV2 の拡張（unpacked など）だけが影響を受ける。
- 拡張の `declarativeNetRequest`（MV3 の広告ブロック拡張が使う）が Electron 44 で動くかは、今回確かめていない。

## 6. 次にやること（案）
1. T0-2 の実機確認で、ストアから入れた拡張の `manifest.json` の `permissions` に `webRequest` があるかを記録し、その機能が動くかを見る。
2. Electron に issue を出すか、既存の issue を探す（MV3 の service worker に `chrome.webRequest` が届かない、Electron 44.4.5、再現手順はこのフォルダ）。
3. 必要なら、`declarativeNetRequest` が動くかを同じ方法で確かめる。
