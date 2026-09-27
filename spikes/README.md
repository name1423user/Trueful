# spikes/（M0 の試作）

SPEC 3章のリスク R1〜R5 と、T1-3a の SQLite 比較を確かめる使い捨ての試作置き場。

## 約束
- 本体（`app/`）から import しない。本体のコードも import しない。
- 試作ごとに独立した pnpm パッケージにする（`pnpm --dir spikes/<名前> start` で起動）。依存は版を完全に固定する。
- セキュリティ設定は本体と同じ（`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`）。
- 結果は `spikes/<名前>/RESULT.md` に `RESULT-TEMPLATE.md` の型で書き、SPEC 3章のリスク表の「試作の結果」列を更新する。
- スクリーンショットは、メールアドレス等を隠してから `screenshots/` に置く。`screenshots/raw/` は git に入らない。
- 認証情報は書かない・コミットしない。Google などは試験用アカウントを推奨。

## 一覧
| タスク | リスク | フォルダ |
|---|---|---|
| T0-1 | R1 Google ログイン | `google-login/` |
| T0-2 | R2 拡張機能 | `extensions/`（未着手） |
| T0-3 | R3 PDF 表示 | `pdf/` |
| T0-4 | R4 検索候補の重ね表示 | `omnibox-popup/`（未着手） |
| T0-5 | R5 広告ブロックと拡張の共存 | `adblock-extensions/`（未着手） |
