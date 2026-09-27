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

## Workspace Git連携用チャンネル

| チャンネル | 方向 | 用途 |
|---|---|---|
| `workspace:git-status` | R→M | ブランチ名・変更ファイル数・ahead/behindを取得 |
| `workspace:git-diff` | R→M | Diff Viewer表示用の差分本体を取得（ファイル単位） |

## 状態遷移（要約）

- Security Mode: `production ⇄ development ⇄ testing ⇄ custom`（ユーザー明示操作のみ、自動遷移なし）
- Test Case: `generated → [queued(B) | awaiting-consent(C)] → executing → executed | rejected | failed`

関連: [データスキーマ](./data-schema.md) / [Event Bus](./event-bus.md)
