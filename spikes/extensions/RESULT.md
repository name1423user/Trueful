# T0-2 拡張機能の試作（R2）結果

目的: `electron-chrome-extensions` と `electron-chrome-web-store` で、必要な拡張が Electron 44 で動くかを確かめる。

## 1. 環境
| 項目 | 値 |
|---|---|
| 実施日 | |
| 実施者 | |
| OS / CPU | |
| Electron / Chromium | （起動時のログ `[spike] versions:` を転記） |
| ライブラリの版 | `electron-chrome-extensions@4.9.0`、`electron-chrome-web-store@0.13.0` |

## 2. 手順

### 準備（1回だけ）
1. `pnpm --dir spikes/extensions install`
2. `node spikes/extensions/node_modules/electron/install.js`（pnpm 12 では `onlyBuiltDependencies` が効かず、Electron 本体が入らないため）
3. `pnpm --dir spikes/extensions reset` で、A・B のログイン状態と、入れた拡張を消す。

### 画面の見方
- 上端がツールバー。左から「A」「B」（タブの切り替え）、URL 欄、拡張のボタン（`<browser-action-list>`）。
- A・B はパーティションが別（`persist:spike-ext-a` / `-b`）で、別の Workspace に当たる。拡張の保存先は共通なので、片方で入れた拡張は、再起動後に両方で読み込まれる。
- UA は T0-1 の推奨どおり `Electron/` を除いている。
- メニュー「試作」: Cmd/Ctrl+1・2 でタブ A・B、Cmd/Ctrl+Shift+S でウェブストア、Cmd/Ctrl+S でスクリーンショット（`screenshots/raw/`）、Cmd/Ctrl+Alt+I でページの DevTools。ページを右クリックすると、拡張のメニュー項目が出る。

### 確認
1. `pnpm --dir spikes/extensions start` で起動する。タブ A でウェブストアが開く。
2. タブ A で、次の拡張をストアから入れる（「Chrome に追加」を押す）。ターミナルの `[spike]` のログを控える。
   | 拡張 | ID |
   |---|---|
   | 1Password | `aeblfdkhhhdcdjpifhhbdiojplfjncoa` |
   | Bitwarden | `nngceckbapebfimnlniiiahkandclblb` |
   | React Developer Tools | `fmkadmapgofadopljbjfkapdkoienihi` |
   | Google 翻訳 | `aapbdbdomjkkjkaonfhkkikfgjllcleb` |
   | （Google 翻訳が動かないとき）DeepL | `cofdbpoegempjloogbagkncekinflcnj` |
3. 主要操作をタブ A で確かめる。それぞれ Cmd/Ctrl+S で証拠を残す。
   - 1Password・Bitwarden: ツールバーのボタンからログインし、ログインフォームのあるページ（例: `https://github.com/login`）で自動入力できるか。
   - React Developer Tools: `https://react.dev` を開き、Cmd/Ctrl+Alt+I の DevTools に「Components」パネルが出て、木構造が見えるか。
   - 翻訳: 英語のページ（例: `https://en.wikipedia.org/wiki/Electron_(software_framework)`）で、ボタンか右クリックのメニューから翻訳できるか。
4. ネイティブメッセージング: 1Password のデスクトップアプリを起動・ロック解除した状態で、1Password 拡張がデスクトップアプリと連携できるか（拡張の設定の「デスクトップアプリとの連携」、または拡張側のロック解除がアプリと連動するか）。ターミナルに `nativeMessaging` 関係のエラーが出たら控える。
5. アプリを終了し、もう一度 `start` で起動する。Cmd/Ctrl+2 でタブ B に切り替え、次を確かめる。
   - B にも拡張が読み込まれているか（ターミナルの `[spike] 拡張（b）:` と、ツールバーのボタン）。
   - 1Password・Bitwarden が、B でもログイン済みか（A でのログインが共有されるか）。
6. unpacked とサイドパネル: 終了して `pnpm --dir spikes/extensions start:unpacked` で起動する。
   - ツールバーに「hello」のボタン（バッジ `ok`）が出るか。押すと、開いた回数と `chrome.sidePanel` の有無が出る。
   - 「サイドパネルを開く」を押して、結果（成功 / 失敗とその理由）を控える。
7. `screenshots/raw/` の画像から、メールアドレスやパスワード管理の中身を隠したものを `screenshots/` に移す。

### 後片付け
- `pnpm --dir spikes/extensions reset`
- 保存場所を丸ごと消す場合: macOS は `~/Library/Application Support/trueful-spike-extensions`、Windows は `%APPDATA%\trueful-spike-extensions`、Linux は `~/.config/trueful-spike-extensions`

## 3. 結果
記号: ◯ 動く / △ 条件付きで動く / × 動かない / － 未実施

| 拡張 | ストア導入 | 主要操作 | B で読み込まれる | B でログインが共有される | 証拠 |
|---|---|---|---|---|---|
| 1Password | | 自動入力: | | | |
| Bitwarden | | 自動入力: | | | |
| React Developer Tools | | Components パネル: | | － | |
| Google 翻訳（または DeepL） | | 翻訳: | | － | |

| 確認項目 | 結果 | 証拠 |
|---|---|---|
| unpacked の読み込み（hello） | | |
| ネイティブメッセージング（1Password のデスクトップアプリ連携） | | |
| サイドパネル（`chrome.sidePanel`） | | |

## 4. 所見
- **ライセンス**: `electron-chrome-extensions` は GPL-3.0 と有料の Patron ライセンスの二択で、コンストラクタに `license` の指定が必須。試作は配布しないので `GPL-3.0` にした。本体で使うなら、Trueful のライセンスをどうするか（GPL にするか、Patron ライセンスを買うか）を先に決める必要がある。`electron-chrome-web-store` は MIT。
- **サイドパネル**: Electron 44 自体が `Permission 'sidePanel' is unknown` と警告する。どちらのライブラリにも `chrome.sidePanel` の実装はない（ソースで確認）。実機の結果で確定させる。
- **ネイティブメッセージング**: ライブラリに `runtime.connectNative` / `sendNativeMessage` の実装があり、Chrome と同じ場所（macOS なら `~/Library/Application Support/Google/Chrome/NativeMessagingHosts` など）と `userData/NativeMessagingHosts` からホストの設定を読む。ただし、デスクトップアプリ側が接続元のブラウザの署名を確かめる場合は、未署名の試作では通らない可能性がある。
- **ツールバーの preload**: `<browser-action-list>` は preload で `injectBrowserAction()` を呼ぶ必要がある。sandbox の preload は node_modules を require できないので、試作では起動時に1枚の preload として書き出した（`userData/toolbar.preload.js`）。本体ではバンドラーで作る。
- **タブの選択**: `addTab` のたびに、ライブラリが `selectTab` の処理を呼んで最後のタブを選ぶ。本体のタブ管理では、この呼び出しで状態が変わることを前提にする。
- ライブラリは Electron 44 の `session.extensions` を使っていて、`addTab` には BaseWindow も渡せる（型定義で確認）。

## 5. 推奨
（結果を見てから記入: 続行 / 合格ラインの見直し / 代替案）

## 付記: 開発環境での起動確認（2026-09-27、Claude Code）
- macOS（darwin-arm64、Electron 44.4.5 / Chromium 152.0.7977.130）で `start:unpacked` を起動し、A・B の両方に hello 拡張が読み込まれ、両方でウェブストアが開くことを確認した。
- DevTools のプロトコルでツールバーを調べ、`<browser-action-list>` に「hello」のボタンが1つ出ていること、起動直後の表示が A のセッションであることを確認した。
- ストアからの導入と各拡張の操作は、アカウントが必要なため実機で行う。
