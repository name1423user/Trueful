# T0-1 Google ログインの試作（R1）結果

目的: Electron 44 の WebContentsView で Google にログインでき、再起動後も保持されるかを確かめる。

## 1. 環境
| 項目 | 値 |
|---|---|
| 実施日 | 2026-09-27 12:43〜12:53 JST |
| 実施者 | るりあ（操作）、Claude Code（ログの確認・記入） |
| OS / CPU | macOS（darwin-arm64）/ Apple Silicon（MacBook Air） |
| Electron / Chromium | `electron=44.4.5 chrome=152.0.7977.130 os=darwin-arm64` |
| Google アカウント | 個人 |

## 2. 手順

### 準備（1回だけ）
1. `pnpm --dir spikes/google-login install`
2. 起動して「Electron failed to install correctly」と出たら、`pnpm --dir spikes/google-login approve-builds` で electron を許可するか、`node spikes/google-login/node_modules/electron/install.js` を実行する。
   - pnpm 12.3.4 では `package.json` の `pnpm.onlyBuiltDependencies` が効かず、Electron 本体が入らなかった。`install.js` を実行して解決した。

### 起動モード
| モード | コマンド | User-Agent |
|---|---|---|
| A 素の状態 | `pnpm --dir spikes/google-login start` | `... trueful-spike-google-login/0.0.0 Chrome/x Electron/44.4.5 Safari/...` |
| B `Electron/` を除く | `pnpm --dir spikes/google-login start:strip` | `... trueful-spike-google-login/0.0.0 Chrome/x Safari/...` |
| C（任意）Chrome と同じ形 | `pnpm --dir spikes/google-login start:chrome-like` | `... Chrome/x Safari/...` |

- モードごとにパーティション（`persist:spike-google-<モード>`）が分かれているので、モード間でログインは混ざらない。
- メニュー「試作」: Cmd/Ctrl+1 ログイン画面、Cmd/Ctrl+2 Google アカウント、Cmd/Ctrl+S スクリーンショット（`screenshots/raw/` に保存）、Cmd/Ctrl+Alt+I DevTools。
- C は、B で拒否されたときの追加の比較用。B で通れば省略してよい。

### 各モードでの確認（A → B →（C）の順）
1. `pnpm --dir spikes/google-login reset` で、全モードのログイン状態を消す（最初の1回だけでよい）。
2. モードのコマンドで起動し、ターミナルの `[spike] User-Agent:` と `[spike] 送信ヘッダー` をコピーしておく。
3. 開いたログイン画面で、メールアドレス → パスワード（→ 2段階認証）の順に進める。
   - 拒否された場合（"This browser or app may not be secure"、「このブラウザまたはアプリは安全でない可能性があります」など）は、その画面で Cmd/Ctrl+S を押し、手順5へ進む。
4. Cmd/Ctrl+2 で Google アカウントの画面を開き、ログイン済みであることを確認して Cmd/Ctrl+S を押す。
5. Cmd/Ctrl+Q で終了し、同じコマンドでもう一度起動する。
6. Cmd/Ctrl+2 を押し、ログインが保持されているか（パスワードを聞かれずに開けるか）を確認して Cmd/Ctrl+S を押す。
7. `screenshots/raw/` の画像から、メールアドレス・名前・アイコンを塗りつぶしたものを `screenshots/` に移す。ファイル名は `<モード>-<手順番号>.png`（例: `strip-electron-3.png`）にする。

### 後片付け
- `pnpm --dir spikes/google-login reset`
- 保存場所を丸ごと消す場合は、次のフォルダを削除する。
  - macOS: `~/Library/Application Support/trueful-spike-google-login`
  - Windows: `%APPDATA%\trueful-spike-google-login`
  - Linux: `~/.config/trueful-spike-google-login`

## 3. 結果
記号: ◯ 動く / △ 条件付きで動く / × 動かない / － 未実施

| モード | ログイン | 再起動後の保持 | 証拠 |
|---|---|---|---|
| A 素の状態 | ◯（パスワード） | ◯ | [ログイン後](screenshots/default-4.png)、[再起動後](screenshots/default-6.png) |
| B `Electron/` を除く | ◯（パスワード） | ◯ | [ログイン後](screenshots/strip-electron-4.png)、[再起動後](screenshots/strip-electron-6.png) |
| C（任意）Chrome と同じ形 | － | － | B で通ったため省略 |

### 送信ヘッダー（手順2のログを転記）
```
（A）accounts.google.com（最初の要求）
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) trueful-spike-google-login/0.0.0 Chrome/152.0.7977.130 Electron/44.4.5 Safari/537.36
（A）apis.google.com（Sec-CH-UA が出た要求）
sec-ch-ua: "Not?A_Brand";v="24", "Chromium";v="152"
sec-ch-ua-mobile: ?0
sec-ch-ua-platform: "macOS"

（B）accounts.google.com（最初の要求）
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) trueful-spike-google-login/0.0.0 Chrome/152.0.7977.130 Safari/537.36
（B）play.google.com・apis.google.com（Sec-CH-UA が出た要求）
sec-ch-ua: "Not?A_Brand";v="24", "Chromium";v="152"
sec-ch-ua-mobile: ?0
sec-ch-ua-platform: "macOS"

（C）未実施
```

## 4. 所見
- **A・B とも拒否されなかった。** "This browser or app may not be secure" は出ていない。
- **UA によって、Google が出すログイン画面が変わる。**
  - A（`Electron/` あり）: `flowName=WebLiteSignIn`（簡易版）。パスキー（`challenge/pk`）→ 方法の選択（`challenge/selection`）→ パスワード（`challenge/pwd`）と、段階ごとに URL が変わった。
  - B（`Electron/` なし）: `flowName=GlifWebSignIn`（Chrome と同じ通常版）。ログインの後に `gds.google.com` の案内画面を経て `myaccount.google.com` に着いた。
- **パスキーが使えない（A・B 共通）。** パスキーの画面は出るが、Touch ID のダイアログが出ず、何も起きなかった。このため、確認方法の選択からパスワードに切り替えてログインした。
  - 原因の推測: Electron には、Chrome が持っている macOS のパスキー（Touch ID・iCloud キーチェーン）を使う仕組みがない。試作は未署名なので、署名と権限を付けた場合は確かめていない。
  - パスキーだけを使うアカウントや、パスキー必須のサイトではログインできない恐れがある。R1 とは別のリスクとして扱う必要がある。
- **Sec-CH-UA のブランドは `"Not?A_Brand"` と `"Chromium"` だけで、"Google Chrome" はない。** それでも拒否はされなかった。`accounts.google.com` への最初の要求には `Sec-CH-UA` が出ず、一部の要求（`apis.google.com`、B では `play.google.com`）にだけ出た。
- 再起動後は、どちらのモードも `accounts.google.com` を経ずに `myaccount.google.com` が開いた。`persist:` パーティションでログインが保持される。
- `sandbox_extension_issue_file failed ... (Operation not permitted)` と `IMKCFRunLoopWakeUpReliable` のログが出たが、動作に影響はなかった（未署名の Electron と macOS の日本語入力による警告と見ている）。

## 5. 推奨
- **続行。** Electron 44 で Google にログインでき、再起動後も保持される。合格ラインを見直す必要はない。
- UA は **B（`Electron/` を除く）を推奨**する。A でも通るが、Google が簡易版のログイン画面に切り替えるため。
- パスキー（WebAuthn の Touch ID・iCloud キーチェーン）は、SPEC 3章に R6 として足した。

## 付記: 開発環境での起動確認（2026-09-27、Claude Code）
- Linux（コンテナ、Xvfb）で 3 モードとも起動し、User-Agent が上の表のとおりになることを確認した。
- 最初の要求（accounts.google.com）では、3 モードとも `webRequest` から見える送信ヘッダーに `Sec-CH-UA` は含まれていなかった。ただし、TLS の接続に失敗した要求なので、実機のログで確かめ直す。
- コンテナのプロキシが TLS を中継するため、Google のページ自体は開けなかった（`ERR_CERT_AUTHORITY_INVALID`）。このため、ログインの確認は実機で行う。
