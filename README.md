# Trueful（トルフ）

開発者の時間を奪わないブラウザ。作業ごとに **Workspace** でタブ・ログイン・拡張を分け、日常の Web 作業を Chrome に戻らずに完結させることを目指しています（Electron 製、macOS・Windows・Linux）。

> まだ開発中（MVP の前）で、配布版はありません。仕様は [SPEC.md](SPEC.md)、計画と進み具合は [PLAN.md](PLAN.md) にあります。

## できること（開発中の今）

- Workspace の作成・切り替え（macOS は Ctrl+1〜9、Windows・Linux は Alt+1〜9）・休止・削除。Workspace ごとにログイン（Cookie）が分かれる
- タブ（新規・閉じる・閉じたタブを戻す・別の Workspace へ移す）、ページの拡大・縮小
- 上端の統合検索欄: URL・Web 検索・タブ・履歴・ブックマーク・Workspace の候補、その場の答え（Unix 時刻・計算・色・Base64 など）、近道（`3000` で `http://localhost:3000`、`gh 語` で GitHub 検索）
- 閲覧履歴、ブックマーク（Chrome の取り込み）、ダウンロード、サイトの権限の確認と取り消し、読み込みエラーの画面
- 起動時の復元と Developer Home、異常終了・データの破損からの復元
- 設定の画面（Cmd/Ctrl+,）。すべての設定は `settings.json` にもあり、手で編集しても反映される

拡張機能・広告ブロック・PDF・更新通知は、これから作ります。

## 開発

必要なもの: Node.js 24、pnpm 12（`corepack enable` で入ります）。

```sh
cd app
pnpm install                                # Electron 本体も入る
pnpm dev                                    # 開発起動
pnpm typecheck && pnpm lint && pnpm test    # 型・lint・単体テスト（PR の前に必ず）
pnpm test:e2e                               # E2E（Playwright で Electron を動かす）
pnpm build:unpack                           # 動作確認用のビルド（app/dist/）
```

- Linux で画面のない環境なら、E2E は `xvfb-run -a pnpm test:e2e` で動きます。
- `pnpm install` の途中で Electron のダウンロードが切れたら、`pnpm exec install-electron` をやり直してください。

構成: `app/src/main`（Main プロセス。機能ごとに `services` と `flows`）、`app/src/preload`（Renderer に出す API）、`app/src/renderer`（React の画面）、`app/e2e`（E2E）。設計の文書は [docs-ja/architecture](docs-ja/architecture)（ADR、データ構造、IPC）。

## 開発体制

実装は Claude Code（AI）が行い、設計の判断と監査は るりあ が行っています。1つのタスクを1つのブランチ・1つの PR にし、別のセッションでのレビューと、3 OS の CI を通してからマージします。詳しくは [CONTRIBUTING.md](CONTRIBUTING.md)。

## 署名していないアプリの起動（配布を始めたら）

運用費を 0 円にするため、コード署名をしていません。初めて起動するときに OS の警告が出ます。ダウンロードしたファイルが本物かは、GitHub Releases に載せる SHA256 で確かめてください。

- **macOS**: アプリを右クリック（Control+クリック）して「開く」を選び、確認で「開く」。または、一度開こうとした後に「システム設定」→「プライバシーとセキュリティ」の「このまま開く」。
- **Windows**: SmartScreen の「Windows によって PC が保護されました」で「詳細情報」→「実行」。
- **Linux**: AppImage に実行の権限を付けて（`chmod +x Trueful-*.AppImage`）起動。

## セキュリティ

脆弱性は公開の Issue に書かず、[SECURITY.md](SECURITY.md) の方法で知らせてください。

## ライセンス

[GPL-3.0](LICENSE)
