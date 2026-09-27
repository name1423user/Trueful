# 調査報告: 拡張の chrome.webRequest が呼ばれない原因（T0-5 の追加調査）

- 作成: 2026-09-27 14:10 JST、改訂: 14:25 JST（Claude Code）。改訂の理由は 2章の「測り方の訂正」。
- きっかけ: T0-5 で、hello 拡張の `chrome.webRequest.onBeforeRequest` が、広告ブロックがなくても一度も呼ばれなかった（[T0-5 の RESULT](../adblock-extensions/RESULT.md)）。

## 1. 結論
1. **Electron 44 では、MV3 の拡張（service worker）に `chrome.webRequest` のイベントが届かない。** service worker は起動し、`addListener` も成功する（`hasListeners()` が `true`）が、イベントは0件だった。ライブラリの有無、セッションの種類（既定 / `persist:`）、広告ブロックの有無は関係ない。原因は Electron 本体にあり、`electron-chrome-extensions` と `electron-chrome-web-store` のせいではない。
2. **MV2 の拡張（background page）には、`chrome.webRequest` が届く。** 同じページの読み込みで 22 件ずつ届き、ライブラリやセッションの影響はなかった。
3. **R5 の仮説は正しかった。** MV2 の拡張でも、Ghostery（`session.webRequest`）を有効にすると `chrome.webRequest` が0件になった。Electron のドキュメントにある「Electron の `webRequest` が `chrome.webRequest` より優先される」のとおり。
4. Chrome ウェブストアの拡張は今は MV3 だけなので、**ストアから入れた拡張の `chrome.webRequest` は、Trueful ではすべて動かない**見込み。広告ブロックとの衝突（R5）より、こちらの方が影響が大きい。
5. 別件: **`session.clearData()` では、拡張の service worker の古いスクリプトが消えない。** unpacked の拡張の `background.js` を書き換えても、保存場所（userData）を丸ごと消すまで古い版が動き続けた。

## 2. 方法
- `spikes/webrequest-probe/` に、条件を引数で切り替えられる最小のアプリを作った（`main.mjs`）。`pnpm --dir spikes/webrequest-probe probe` で、下の12通りを順に実行する（`run-matrix.mjs`）。各回の前に、保存場所（macOS は `~/Library/Application Support/trueful-spike-webrequest-probe`）を丸ごと消す。
- 確認用の拡張は MV2 と MV3 の2つ（`fixtures/mv2`、`fixtures/mv3`）。中身は同じで、権限は `webRequest` と `<all_urls>`。
  - 起動したとき、`addListener` を終えたとき（`hasListeners()` の値つき）、`webRequest.onBeforeRequest`・`webRequest.onCompleted`・`webNavigation.onCommitted` が呼ばれるたびに、Main の小さな HTTP サーバー（`http://127.0.0.1:47813/`）へ報告する。報告の要求そのものは数えない。
- Main は報告を数え、拡張の起動を 1.5 秒待ってから、`https://example.com/` → `https://en.wikipedia.org/wiki/Electron_(software_framework)` の順に開く。
- 環境: macOS（darwin-arm64）、Electron 44.4.5 / Chromium 152.0.7977.130、`electron-chrome-extensions@4.9.0`、`electron-chrome-web-store@0.13.0`、`@ghostery/adblocker-electron@2.18.2`。

### 測り方の訂正
最初の版では、次の2つの誤りがあった。結論は変わらなかったが、この版で測り直した。
- 拡張の `console.log` を Main で拾って数えていた。しかし、MV3 の service worker の console は、Main（`session.serviceWorkers` の `console-message`）に最初の1行しか届かなかった。
- 各回の最初に `session.clearData()` を呼んでいたが、拡張の service worker の古いスクリプトが消えず、MV3 では古い版の `background.js` が動いていた。DevTools のプロトコルで service worker につないで気づいた。
- 対策として、報告の方法を HTTP に変え、各回の前に保存場所を丸ごと消すようにした。

## 3. 結果
数字は、そのイベントが呼ばれた回数。全12通りで「起動」と「登録」（`hasListeners()` が `true`）の報告が1回ずつ届いた。

| # | 拡張 | ライブラリ | セッション | 広告ブロック | onBeforeRequest | onCompleted | webNavigation |
|---|---|---|---|---|---|---|---|
| 1 | MV3 | なし | persist | なし | **0** | **0** | （API なし） |
| 2 | MV3 | extensions | persist | なし | **0** | **0** | 2 |
| 3 | MV3 | web store | persist | なし | **0** | **0** | （API なし） |
| 4 | MV3 | 両方 | persist | なし | **0** | **0** | 2 |
| 5 | MV2 | なし | persist | なし | 22 | 22 | （API なし） |
| 6 | MV2 | extensions | persist | なし | 22 | 22 | 2 |
| 7 | MV2 | web store | persist | なし | 22 | 22 | （API なし） |
| 8 | MV2 | 両方 | persist | なし | 22 | 22 | 2 |
| 9 | MV3 | なし | 既定 | なし | **0** | **0** | （API なし） |
| 10 | MV2 | なし | 既定 | なし | 22 | 22 | （API なし） |
| 11 | MV3 | 両方 | persist | あり | **0** | **0** | 2 |
| 12 | MV2 | 両方 | persist | あり | **0** | **0** | 2 |

読み取れること:
- 1〜4・9・11（MV3）はすべて0。ライブラリとセッションは関係ない。
- 5〜8・10（MV2）はすべて 22。ライブラリとセッションは関係ない。
- 8 と 12 の差は広告ブロックだけで、22 → 0 になった。R5 の「上書き」が起きている。
- `webNavigation` は Electron 単体にはなく（`Permission 'webNavigation' is unknown`）、`electron-chrome-extensions` が足している。こちらは MV3 でも MV2 と同じ回数届いた（2・4・11）。MV3 の service worker が動いていないわけではなく、Electron 本体の `chrome.webRequest` のイベントだけが届いていない。

## 4. 外部の情報との照合
- Electron の公式ドキュメント（Supported Extensions APIs）は、`chrome.webRequest` を「All features of this API are supported」としている。MV3 や service worker についての記述はない。今回の結果は、このドキュメントと食い違う。
- 同じドキュメントに「Electron's `webRequest` module takes precedence over `chrome.webRequest` if there are conflicting handlers.」とある。結果の 8 と 12 の差と一致する。
- Electron の issue [#52265](https://github.com/electron/electron/issues/52265)（2026-07、閉じている）:
  - 本題は、Electron 43 で `chrome.webRequest` の中身が空になる不具合（パッケージの作り方の問題）。MV2 でも起きていた。44 では直っていて、今回 MV2 で動いたことと一致する。
  - 報告者のコメントに「修正後も、MV3 の service worker には webRequest のイベントが届かない（45 の nightly で確認）」とある。今回の結論1と同じ。この部分は、独立した issue になっていない。
- ライブラリ側で肩代わりする PR（[samuelmaddock/electron-browser-shell#183](https://github.com/samuelmaddock/electron-browser-shell/pull/183)「feat: observational chrome.webRequest support」）があった。`session.webRequest` で受けたイベントを拡張に流す作りだが、広告ブロック拡張（uBlock Lite など）の遮断が効かなくなるとの指摘があり、2026-08-11 にマージされずに閉じられた。`electron-chrome-extensions` の最新版は、今回使った 4.9.0（2025-07）。

## 5. 影響
- **R2（拡張）**: ストアの拡張が `chrome.webRequest` を使う機能は、広告ブロックと関係なく動かない。どの機能が使っているかは拡張ごとに違う。T0-2 の実機確認で、拡張ごとに影響を見る。
- **R5（広告ブロック）**: MV3 の拡張には、もともと `chrome.webRequest` が届かない。そのため、広告ブロックを入れても、MV3 の拡張が新たに困ることはない。MV2 の拡張（unpacked など）だけが影響を受ける。ただし、4章のコメントによると、`session.webRequest` にリスナーがあると、拡張の `declarativeNetRequest`（MV3 の広告ブロック拡張が使う）の遮断も効かなくなる。内蔵広告ブロックと広告ブロック拡張は、同時には使えないと考えておく。
- **本体の開発**: 拡張の更新や入れ直しで古い service worker が残る恐れがある。拡張を管理する機能（T3-6）で、service worker の登録を確実に消す方法を確かめる必要がある。
- 対策の候補（M0 のデモで判断）:
  - `chrome.webRequest` が要る拡張は「一部動きません」と表示する（SPEC の R5 の対応に近い）。
  - 4章の PR と同じ肩代わりを自前で作る。ただし、内蔵広告ブロックや `declarativeNetRequest` と両立しない。
  - Electron の対応を待つ。

## 6. 次にやること
1. T0-2 の実機確認で、ストアから入れた拡張の `manifest.json` の `permissions` に `webRequest` があるかを記録し、その機能が動くかを見る。
2. M0 のデモで、上の対策の候補から選ぶ。
3. Electron への issue は出さない（2026-09-27 に、るりあが判断）。
