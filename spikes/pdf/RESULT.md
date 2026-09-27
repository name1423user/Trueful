# T0-3 PDF表示の試作（R3）結果

目的: Electron 44 の WebContentsView で Chromium の PDF ビューアが使えるか（URL とローカルファイルで、表示・拡大・ページ内検索・印刷）を確かめる。

## 1. 環境
| 項目 | 値 |
|---|---|
| 実施日 | |
| 実施者 | |
| OS / CPU | |
| Electron / Chromium | 起動時のログ `[spike] versions:` を転記 |
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
| 表示 | | | | | |
| 拡大（ツールバー） | | | | | |
| 拡大（Cmd/Ctrl+=） | | | | | |
| ページ内検索（件数・強調） | | | | | |
| 印刷（ダイアログ・プレビュー） | | | | | |
| ダウンロードに回っていないか | | | | | |

## 4. 所見
（実機確認の後に記入）

## 5. 推奨
（実機確認の後に記入）

## 付記: 開発環境での起動確認（2026-09-27、Claude Code）
- macOS（darwin-arm64）で A〜D の4モードを起動し、数秒後に終了させた。操作（拡大・検索・印刷）はしていない。
- 4モードとも `[spike] versions: electron=44.4.5 chrome=152.0.7977.130 os=darwin-arm64` の後、`読み込み完了` と `子フレームの移動: chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html`（PDF ビューア）が出た。`will-download` と `読み込み失敗` は出なかった。
- `plugins=false` でも、PDF ビューアのフレームと `--pdf-renderer` のプロセスが起動した。Electron 44 では `webPreferences.plugins` は PDF 表示に影響しない見込み。実機の画面で確かめる。
