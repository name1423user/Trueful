# 開発への参加

Trueful は、実装を Claude Code（AI）が行い、設計の判断と監査を るりあ が行う体制で作っています。人の手による変更も、同じ決まりで受け付けます。AI のための詳しい決まりは [CLAUDE.md](CLAUDE.md) にあります。

## 進め方

- 仕様は [SPEC.md](SPEC.md)、計画は [PLAN.md](PLAN.md)。食い違ったら SPEC を正とします。SPEC と違う実装をするときは、SPEC の更新も同じ PR に入れてください。
- PLAN.md のタスクを1つずつ。1タスク＝1ブランチ（`feat/<タスクID>-<短い名前>`）＝1PR。
- 差分は1PRあたり300行以内（テストとロックファイルを除く）。超えそうなら、先にタスクの分割を提案してください。
- テストを先に書き、受け入れ条件ごとにテストを対応させます。

## PR を出す前に

```sh
cd app
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e
```

PR の本文には、変更の要約（3行以内）、受け入れ条件ごとの合否表、スクリーンショットか動画、実行したコマンドと結果を書いてください。CI は macOS・Windows・Linux の3つで動きます。

## 先に相談してほしいこと

依存の追加、DB のスキーマの変更、IPC のチャネルの追加・変更、ADR と違う判断、`sandbox` などセキュリティの設定の変更。

## してはいけないこと

- `contextIsolation`・`sandbox` を無効にする
- 秘密の情報（トークンなど）をコミットする
- テストを消したり、スキップしたりして通す

## コードの決まり（抜粋）

- Main は `app/src/main/<機能>/services`（単機能、画面への知らせなし）と `flows`（進行役）に分けます。
- Renderer は WebContentsView を描きません。空の div の位置と大きさを IPC で Main に伝えるだけです。
- IPC のチャネルは `app/src/main/ipc/` の1か所で定義し、受け取る側で引数を検証します。preload から `ipcRenderer` をそのまま出しません。
- SQLite は snake_case、TypeScript は camelCase。スキーマの変更はマイグレーションで。
- ファイルの書き込みはアトミックに（一時ファイルに書いてから名前を変える）。
- 画面の文字列は辞書（`app/src/renderer/src/locales/`）を通します。
- 選択中のハイライトに Blue を使いません（Blue は Production の Mode 色だけ）。

## ライセンス

送ってくれた変更は、[GPL-3.0](LICENSE) で公開されます。
