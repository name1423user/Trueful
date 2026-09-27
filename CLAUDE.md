# CLAUDE.md（Trueful）

開発者向けブラウザ Trueful（Electron）。仕様は `SPEC.md`、計画は `PLAN.md`。食い違ったら SPEC を正とし、止まって確認する。

## コマンド
```
cd app
pnpm install
pnpm typecheck && pnpm lint && pnpm test   # PR前に必ず
pnpm test:e2e                              # Playwright（Electron）
pnpm dev                                   # 開発起動
pnpm build:unpack                          # 動作確認用ビルド
```

## 進め方
- PLAN.md のタスクを1つずつ。1タスク＝1ブランチ（`feat/<タスクID>-<短い名前>`）＝1PR。
- 先に計画を出し、るりあの承認を得てから実装する。
- テストを先に書く。受け入れ条件ごとにテストを対応させる。
- PR本文: 変更の要約（3行以内）、受け入れ条件ごとの合否表、スクリーンショットか動画、実行したコマンドと結果、「るりあ向けの解説」（Pythonで言うと何か、なぜこう書いたか）。
- 差分は1PRあたり300行以内（テストとロックファイルを除く）。超えそうなら、着手前にタスクの分割を提案する。
- 実装とは別のセッションでレビューを行い、指摘と対応をPRに書く。

## コードの約束
- Main: `app/src/main/<feature>/services`（単機能、UI通知なし）と `flows`（進行役）に分ける。
- Renderer は WebContentsView を描画しない。空の div の位置とサイズを IPC で Main に報告するだけ。
- IPC はチャネルを `app/src/main/ipc/` の1か所で定義し、受信側で引数を検証する。preload から `ipcRenderer` をそのまま出さない。
- SQLite は snake_case、TypeScript は camelCase。スキーマ変更はマイグレーションで。
- ファイル書き込みはアトミック（tmp → rename）。
- UI 文字列は辞書ファイル経由（将来の英語対応のため）。
- 選択中のハイライトにBlueを使わない（BlueはProductionのMode色専用）。

## 境界線
- 常にやる: テスト追加、PR に合否表とスクリーンショット、SPEC と違う実装をしたら SPEC 更新も同じ PR に入れる。
- 先に確認: 依存の追加、スキーマ変更、IPC チャネルの追加・変更、ADR と異なる判断、sandbox 等のセキュリティ設定の変更。
- 絶対やらない: PR を自分でマージする、`contextIsolation` / `sandbox` を無効にする、秘密情報をコミットする、テストを消したりスキップして通す。
