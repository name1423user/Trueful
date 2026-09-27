# T0-1 Google ログインの試作（R1）結果

目的: Electron 44 の WebContentsView で Google にログインでき、再起動後も保持されるかを確かめる。

## 1. 環境
| 項目 | 値 |
|---|---|
| 実施日 | |
| 実施者 | |
| OS / CPU | |
| Electron / Chromium | （起動時のログ `[spike] versions:` を転記） |
| Google アカウント | 試験用 / 個人（どちらかを記入。アドレスは書かない） |

## 2. 手順

### 準備（1回だけ）
1. `pnpm --dir spikes/google-login install`
2. 起動して「Electron failed to install correctly」と出たら、`pnpm --dir spikes/google-login approve-builds` で electron を許可するか、`node spikes/google-login/node_modules/electron/install.js` を実行する。

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
| A 素の状態 | | | |
| B `Electron/` を除く | | | |
| C（任意）Chrome と同じ形 | | | |

### 送信ヘッダー（手順2のログを転記）
```
（A）
（B）
（C）
```

## 4. 所見
- 拒否された場合: 画面の文言、どの段階（メールアドレスの入力後、パスワードの入力後など）で拒否されたか。
- 送信ヘッダーに `Sec-CH-UA` が含まれていれば、その中に "Google Chrome" のブランドがあるかどうか。UA を変えても拒否される場合の手がかりになる。

## 5. 推奨
（結果を見てから記入: 続行 / 合格ラインの見直し / 代替案）

## 付記: 開発環境での起動確認（2026-09-27、Claude Code）
- Linux（コンテナ、Xvfb）で 3 モードとも起動し、User-Agent が上の表のとおりになることを確認した。
- 最初の要求（accounts.google.com）では、3 モードとも `webRequest` から見える送信ヘッダーに `Sec-CH-UA` は含まれていなかった。ただし、TLS の接続に失敗した要求なので、実機のログで確かめ直す。
- コンテナのプロキシが TLS を中継するため、Google のページ自体は開けなかった（`ERR_CERT_AUTHORITY_INVALID`）。このため、ログインの確認は実機で行う。
