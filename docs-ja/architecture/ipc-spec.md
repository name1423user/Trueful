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
| `tab:list` | R→M | Workspace のタブ（並び順）と選択中のタブの id（F02。選択中は最後に選んだタブ）。タブが1つもなければ空のタブを開いてから返す |
| `tab:create` | R→M | 空のタブを一番右に開いて選ぶ（Cmd/Ctrl+T） |
| `tab:close` | R→M | タブを閉じる（Cmd/Ctrl+W）。選択中を閉じたら、その前に選んでいたタブを選ぶ（使った順）。最後の1つを閉じたら空のタブを開く。閉じた後のタブ列を返す。`workspaceId` とタブの持ち主が違えば `not-found` |
| `tab:reopenClosed` | R→M | 最後に閉じたタブを、閉じたときと同じ「左から何番目」に戻して選ぶ（足りなければ右端。Cmd/Ctrl+Shift+T）。控えは Workspace ごとにメモリだけ、25 個まで。空のタブは積まない。なければ `null` |
| `tab:activate` | R→M | タブを選ぶ。`workspaceId` とタブの持ち主が違えば `not-found` |
| `tab:navigate` | R→M | アドレスバーの入力を開く（F02）。Main が解釈する: 1〜65535 の数字は `http://localhost:<番号>`、「近道のキーワード 語」は近道（settings の shortcuts）、URL らしいものは開き（スキームがなければ https、localhost と IP は http）、それ以外は既定の検索エンジン（Google）で検索。開くのは http・https と `about:blank` だけ |
| `view:setBounds` | R→M | ページを表示する場所（Renderer の空の div の位置と大きさ、整数の CSS ピクセル。ADR-008） |
| `tab:pageChanged` | M→R | ページの URL・タイトル・戻る/進むの可否・読み込み中が変わった（タブの id と一緒に） |

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
