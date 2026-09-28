# IPC仕様

IPCはinvoke型（request/response）を採用。詳細は [ADR-007](./adr/adr-007-ipc-invoke.md) を参照。

## 主要チャンネル

| チャンネル | 方向 | 用途 |
|---|---|---|
| `workspace:load` / `workspace:switch-security-profile` | R→M | Workspace読込・モード変更 |
| `inspector-agent:generate-matrix` / `execute-case` | R→M | テスト生成・実行 |
| `ai-broker:enqueue` / `ai-broker:status` | R→M / M→R | AI推論の一元キュー管理 |
| `plugin:register-test-pattern` | R→M | Plugin由来パターン登録（Tier申告は無効・Main側で再計算） |
| `inspector-bar:update` | M→R | 状態の即時反映 |

## 実装済みのチャンネル

定義は `app/src/main/ipc/`（名前は `channelNames.ts`、引数の検証は各 `*Channels.ts`）。受信側の入口 `createIpc` が、送り元（UI のウィンドウのメインフレームか）と引数を確かめ、結果を `{ ok: true, value }` か `{ ok: false, error: { code, message } }` で返す。

| チャンネル | 方向 | 用途 |
|---|---|---|
| `settings:get` | R→M | 設定と、読み込み時の問題（壊れていた・不正な値があった）を取得（F14） |
| `settings:update` | R→M | 設定の一部を更新（知らない項目・不正な値は `invalid-args`） |
| `settings:changed` | M→R | 設定が変わった（手で編集されたときも含む） |
| `workspace:list` | R→M | Workspace の一覧（左パネルの並び順）と、今の Workspace の id（F01） |
| `workspace:create` | R→M | 名前（1〜100文字、前後の空白は除く）と Mode で作り、今の Workspace にする。同じ `requestId` の二度目は、中身（名前・Mode）を見ずに最初の結果を返す |
| `workspace:switch` | R→M | 切り替える（ない id は `not-found`） |

エラーの `code`: `forbidden-sender`（送り元が UI でない）、`invalid-args`（引数が不正）、`not-found`（対象がない）、`unavailable`（DB などの準備ができていない）、`internal`（そのほか）。

## Workspace Git連携用チャンネル

| チャンネル | 方向 | 用途 |
|---|---|---|
| `workspace:git-status` | R→M | ブランチ名・変更ファイル数・ahead/behindを取得 |
| `workspace:git-diff` | R→M | Diff Viewer表示用の差分本体を取得（ファイル単位） |

## 状態遷移（要約）

- Security Mode: `production ⇄ development ⇄ testing ⇄ custom`（ユーザー明示操作のみ、自動遷移なし）
- Test Case: `generated → [queued(B) | awaiting-consent(C)] → executing → executed | rejected | failed`

関連: [データスキーマ](./data-schema.md) / [Event Bus](./event-bus.md)
