# T0-3 PDF表示の試作（R3）結果

目的: Electron 44 の WebContentsView で Chromium の PDF ビューアが使えるか（URL とローカルファイルで、表示・拡大・ページ内検索・印刷）を確かめる。

## 1. 環境
| 項目 | 値 |
|---|---|
| 実施日 | 2026-09-27 14:24〜14:28 JST |
| 実施者 | Claude Code（画面操作で実施。るりあの依頼、リモート） |
| OS / CPU | macOS（darwin-arm64）/ Apple Silicon（MacBook Air） |
| Electron / Chromium | `electron=44.4.5 chrome=152.0.7977.130 os=darwin-arm64` |
| ライブラリの版 | `package.json` のとおり（違えば記入） |

## 2. 手順

### 準備（1回だけ）
1. `pnpm --dir spikes/pdf install`
2. `node spikes/pdf/node_modules/electron/install.js` を実行して、Electron 本体を入れる。
   - pnpm 12.3.4 では `package.json` の `pnpm.onlyBuiltDependencies` が効かず、install だけでは Electron 本体が入らない（T0-1 と同じ）。

### 使う PDF
| 種類 | 場所 | 検索語 |
|---|---|---|
| ローカル | `spikes/pdf/fixtures/sample.pdf`（3ページ、1.4KB、手書きの PDF） | `TRUEFUL-FIND`（1・3ページ目に1回ずつ、計2件） |
| URL | `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`（W3C のテスト用、1ページ） | `Dummy`（本文 "Dummy PDF file"） |

### 起動モード
| モード | コマンド |
|---|---|
| A ローカル・plugins=true | `pnpm --dir spikes/pdf start` |
| B URL・plugins=true | `pnpm --dir spikes/pdf start:url` |
| C ローカル・plugins=false | `pnpm --dir spikes/pdf start:no-plugins` |
| D URL・plugins=false | `pnpm --dir spikes/pdf start:url:no-plugins` |

- `plugins` は `webPreferences.plugins` の値。昔の Electron では PDF 表示に `true` が必要だったので、両方で比べる。
- 任意の PDF は `pnpm --dir spikes/pdf exec electron . --plugins=true --open=<URL またはパス> --find=<検索語>` で開ける。
- メニュー「試作」: Cmd/Ctrl+1 ローカルの PDF、Cmd/Ctrl+2 URL の PDF、Cmd/Ctrl+F ページ内検索（`webContents.findInPage`）、Cmd/Ctrl+G 次を検索、Cmd/Ctrl+= / - / 0 ページのズーム、Cmd/Ctrl+P 印刷（`webContents.print()`）、Cmd/Ctrl+R 再読み込み、Cmd/Ctrl+S スクリーンショット（`screenshots/raw/` に保存）、Cmd/Ctrl+Alt+I DevTools。
- Electron には Chrome の検索バーがないため、ページ内検索は `findInPage` で固定の語を探し、結果をターミナルの `[spike] 検索:` で見る。

### 各モードでの確認（A → B → C → D の順）
1. モードのコマンドで起動し、ターミナルの `[spike] versions:` をコピーしておく（1回目だけでよい）。
2. **表示**: PDF が画面に表示されるかを見る。ターミナルに `[spike] 子フレームの移動: chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html` が出ていれば、PDF ビューアが動いている。Cmd/Ctrl+S を押す。
   - 真っ白・読み込み失敗（`[spike] 読み込み失敗:`）なら、その画面で Cmd/Ctrl+S を押し、手順6へ進む。
3. **拡大**: (a) ビューアのツールバーの「+」を2回押し、文字がぼやけずに大きくなるかを見る。(b) 「−」で戻した後、Cmd/Ctrl+= を2回押し、同じく大きくなるかを見る。Cmd/Ctrl+S を押し、Cmd/Ctrl+0 で戻す。
4. **ページ内検索**: (a) Cmd/Ctrl+F を押し、ターミナルの `[spike] 検索: 1/<件数> 件目` と、PDF 上の強調表示を見る（ローカルは 2件、URL は 1件が期待値）。ローカルでは Cmd/Ctrl+G で 2件目（3ページ目）に移るかも見る。Cmd/Ctrl+S を押す。(b) PDF の本文をクリックしてから Cmd/Ctrl+F を押した場合も同じか（ビューア自身が検索を持っていないか）を見る。
5. **印刷**: Cmd/Ctrl+P を押し、印刷ダイアログが出るか、プレビューに PDF の中身（ローカルなら3ページ）が出るかを見る。実際には印刷せず「PDF として保存」で `screenshots/raw/print-<モード>.pdf` に保存するか、キャンセルする。ビューアのツールバーの印刷ボタンも同じく試す。ターミナルの `[spike] 印刷: ok=...` を記録する。
6. **ダウンロードに回っていないか**: ターミナルに `[spike] will-download` が出ていないかを見る（出たら、表示されずにダウンロードに回ったということ。保存ダイアログは出さずに取り消している）。
7. Cmd/Ctrl+Q で終了し、次のモードへ。
8. `screenshots/raw/` の画像を見て、各項目の証拠を `screenshots/<モード>-<手順番号>.png`（例: `A-3.png`）の名前で `screenshots/` に移す。

### 後片付け
保存場所を丸ごと消す場合は、次のフォルダを削除する。
- macOS: `~/Library/Application Support/trueful-spike-pdf`
- Windows: `%APPDATA%\trueful-spike-pdf`
- Linux: `~/.config/trueful-spike-pdf`

## 3. 結果
記号: ◯ 動く / △ 条件付きで動く / × 動かない / － 未実施

| 確認項目 | A ローカル・plugins=true | B URL・plugins=true | C ローカル・plugins=false | D URL・plugins=false | 証拠 |
|---|---|---|---|---|---|
| 表示 | ◯ | ◯ | ◯ | ◯ | [A](screenshots/A-2.png)、[B](screenshots/B-2.png)、[C](screenshots/C-2.png)、[D](screenshots/D-2.png) |
| 拡大（ツールバー） | ◯ | ◯ | ◯ | ◯ | [A: 97%→110%](screenshots/A-3a.png)。B〜D は画面操作中の目視のみ（110% になった） |
| 拡大（Cmd/Ctrl+=） | ×（発火は未確認） | － | － | － | [A: 2回押しても 90% のまま](screenshots/A-3b.png)。メニューの処理が呼ばれたかはログで確かめていない |
| ページ内検索（件数・強調） | △ | △ | △ | △ | [A: 3ページ目の2件目](screenshots/A-4.png)、[B: ファイル名に当たる](screenshots/B-4.png)、[C](screenshots/C-4.png)、[D](screenshots/D-4.png)。A・C は本文の強調表示が移ったが、件数が期待値より1多い（4章） |
| 印刷: ビューアの印刷ボタン | ◯ | △ | △ | △ | 4モードとも macOS の印刷ダイアログが出た（画面操作中の目視）。出力を確かめたのは A だけ（「PDF として保存」で3ページ） |
| 印刷: アプリの Cmd/Ctrl+P（`webContents.print()`） | △ | － | － | － | A でダイアログは出たが、出力は未確認（`ok=false Print job canceled`） |
| ダウンロードに回っていないか | ◯ | ◯ | ◯ | ◯ | 4モードとも `will-download` は出なかった |

## 4. 所見
- **表示とビューアのボタンでの拡大は、URL とローカルの両方で動いた。** 検索と印刷には条件がある（下記）。
- **`plugins=false` でも結果は同じだった。** Electron 44 では `webPreferences.plugins` は PDF 表示に影響しない。本体で `plugins: true` にする必要はない。
- **アプリの Cmd/Ctrl+=（`webContents.setZoomLevel`）では、A で PDF の倍率が変わらなかった。** ただし、メニューの処理が呼ばれたか（ショートカットが発火したか）をログで確かめていないので、「効かない」とまでは言えない。PDF はビューアの中の別のフレームで描かれるので、外側のページを拡大しても変わらない可能性がある。本体の F06 で確かめ直す。
- **ページ内検索（`webContents.findInPage`）は、ビューアの画面の文字にも当たる。** B では、検索語「Dummy」がツールバーのファイル名「dummy.pdf」に当たり、Cmd/Ctrl+G を押しても本文の強調表示に移らなかった（D は Cmd/Ctrl+G を押していない）。ファイル名に含まれない語で試していないので、原因がファイル名だけかは切り分けていない。A・C は本文の1ページ目 → 3ページ目と移ったが、件数は期待値（2件）より1多い `2/3` になった。B も期待値（1件）に対して `1/3` と出た。3件目がどこに当たったかは確かめていない（ビューアの画面の文字や、読み上げ用の文字などが考えられる）。本体の検索バーを PDF で使うときは、この振る舞いを考えておく。
- **印刷プレビューはない。** Electron には Chrome の印刷プレビューがなく、macOS の印刷ダイアログがいきなり出る。ダイアログの「ページ」欄は「全1ページ」と出るが、A でビューアの印刷ボタンから「PDF として保存」すると、3ページすべてが出力された。B〜D の出力と、アプリの Cmd/Ctrl+P（`webContents.print()`）の出力は確かめていない（A の Cmd/Ctrl+P は、途中でシステムの通知ダイアログが前面に出て `Print job canceled` になった）。本体で使うのは `webContents.print()` の方になる見込みなので、T3-4（PDF 閲覧）で確かめる。
- 試作の Cmd/Ctrl+S（`capturePage`）は、ウィンドウが見えていないデスクトップにあると `Current display surface not available for capture` で失敗した。

## 5. 推奨
- **続行（条件付き）。** Chromium の PDF ビューアをそのまま使い、PDF.js は組み込まない。ただし、ページ内検索と `webContents.print()` の出力は、T3-4 で確かめ直す。
- SPEC に反映する案:
  - F06（PDF 閲覧）で、拡大はビューアのツールバーで行うこと、Cmd/Ctrl+= をどう扱うかを決める。
  - 検索バーは、PDF ではビューアの画面の文字にも当たることを、既知の制限として書く。
  - 印刷はプレビューなしで OS のダイアログを出すこと。

## 付記: 開発環境での起動確認（2026-09-27、Claude Code）
- macOS（darwin-arm64）で A〜D の4モードを起動し、数秒後に終了させた。操作（拡大・検索・印刷）はしていない。
- 4モードとも `[spike] versions: electron=44.4.5 chrome=152.0.7977.130 os=darwin-arm64` の後、`読み込み完了` と `子フレームの移動: chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html`（PDF ビューア）が出た。`will-download` と `読み込み失敗` は出なかった。
- `plugins=false` でも、PDF ビューアのフレームと `--pdf-renderer` のプロセスが起動した。実機の画面でも同じだった（3章）。

## 付記: 実機確認について
- 操作は、るりあの依頼で Claude Code が画面操作（computer use）で行った（14:24〜14:28）。るりあ自身は画面を見ていない。
- 手順4(b)（本文をクリックしてから Cmd/Ctrl+F）は未実施。
- 証拠の画像は、試作の Cmd/Ctrl+S（`capturePage`）で撮った `screenshots/raw/` のものを改名した。A-2・C-2 と、B-2・D-2 は、ビューの中身が同じなので同じ画像になっている。元の名前: A-2 `plugins-true-…05-24-26`、A-3a `…05-24-28`、A-3b `…05-24-31`、A-4 `…05-24-41`、B-2 `plugins-true-…05-26-50`、B-4 `…05-26-53`、C-2 `plugins-false-…05-27-39`、C-4 `…05-27-43`、D-2 `plugins-false-…05-28-08`、D-4 `…05-28-12`（時刻は UTC）。
