# Trueful（トルフ）

開発者の時間を奪わないブラウザ。作業ごとに **Workspace** でタブ・ログイン・拡張を分け、日常の Web 作業を Chrome に戻らずに完結させることを目指しています（Electron 製、macOS・Windows・Linux）。

> まだ開発中（MVP の前）で、配布版はありません。仕様は [SPEC.md](SPEC.md)、計画と進み具合は [PLAN.md](PLAN.md) にあります。

## できること（開発中の今）

- Workspace の作成・切り替え（macOS は Ctrl+1〜9、Windows・Linux は Alt+1〜9）・削除。6 個目からは、長く使っていないものを自動で休止。Workspace ごとにログイン（Cookie）が分かれる
- タブ（新規・閉じる・閉じたタブを戻す・別の Workspace へ移す）
- 上端の統合検索欄: URL・Web 検索・タブ・履歴・ブックマーク・Workspace の候補、その場の答え（Unix 時刻・計算・色・Base64 など）、近道（`3000` で `http://localhost:3000`、`gh 語` で GitHub 検索）
- 閲覧履歴、ブックマーク（Chrome の取り込み）、ダウンロード、サイトの権限の確認、読み込みエラーの画面
- 起動時の復元と Developer Home、異常終了・データの破損からの復元
- 設定は `settings.json`（保存場所の中）にあり、手で編集しても反映される

拡張機能・広告ブロック・PDF・更新通知は、これから作ります。

## 開発

必要なもの: Node.js 24、pnpm 12（CI と同じ版にするなら `corepack enable && corepack prepare pnpm@12.3.4 --activate`）。

```sh
cd app
pnpm install                                # Electron 本体も入る
pnpm dev                                    # 開発起動
pnpm typecheck && pnpm lint && pnpm test    # 型・lint・単体テスト（PR の前に必ず）
pnpm test:e2e                               # E2E（Playwright で Electron を動かす）
pnpm build:unpack                           # 動作確認用のビルド（app/dist/）
```

- Linux で画面のない環境なら、E2E は `xvfb-run -a pnpm test:e2e` で動きます。Ubuntu 24.04 以降は、非特権のユーザー名前空間の制限で Chromium のサンドボックスが起動しないことがあります。CI と同じく `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` で外してください（`--no-sandbox` は使わない）。
- `pnpm install` の途中で Electron のダウンロードが切れたら、`pnpm exec install-electron` をやり直してください。

構成: `app/src/main`（Main プロセス。機能ごとに `services` と `flows`）、`app/src/preload`（Renderer に出す API）、`app/src/renderer`（React の画面）、`app/e2e`（E2E）。設計の文書は [docs-ja/architecture](docs-ja/architecture)（ADR、データ構造、IPC）。

## 開発体制

実装は Claude Code（AI）が行い、設計の判断と監査は るりあ が行っています。1つのタスクを1つのブランチ・1つの PR にし、別のセッションでのレビューと、3 OS の CI を通してからマージします。詳しくは [CONTRIBUTING.md](CONTRIBUTING.md)。

## 署名していないアプリの起動（配布を始めたら）

運用費を 0 円にするため、コード署名をしていません。初めて起動するときに OS の警告が出ます。

まず、ダウンロードしたファイルが本物かを、GitHub Releases に載せる SHA256 と比べて確かめてください。

- macOS: `shasum -a 256 <ファイル>`
- Linux: `sha256sum <ファイル>`
- Windows（PowerShell）: `Get-FileHash <ファイル> -Algorithm SHA256`

起動のしかた:

- **macOS**: 一度開こうとして警告を閉じ、「システム設定」→「プライバシーとセキュリティ」の「このまま開く」を押して、パスワードか Touch ID で確かめる（macOS 15 Sequoia 以降。14 以前は、右クリックの「開く」でもよい）。
- **Windows**: SmartScreen の「Windows によって PC が保護されました」で「詳細情報」→「実行」。Smart App Control が有効だと、この選択肢が出ずに止められます。
- **Linux**: AppImage に実行の権限を付けて（`chmod +x Trueful-*.AppImage`）起動。Ubuntu 22.04 以降は `libfuse2` が要ります。24.04 以降は、上の「開発」と同じユーザー名前空間の制限に当たることがあります。

配布を始めたら、実際の配布物でこの手順を確かめ直します。

## セキュリティ

脆弱性は公開の Issue に書かず、[SECURITY.md](SECURITY.md) の方法で知らせてください。

## ライセンス

[GPL-3.0](LICENSE)
