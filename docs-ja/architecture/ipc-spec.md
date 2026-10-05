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
| `workspace:delete` | R→M | 削除する（ない id は `not-found`）。確認は画面で済ませてから呼ぶ。返事は削除後の今の Workspace の id（なければ null） |
| `bookmark:list` | R→M | ブックマークの全部（親ごと・順番どおり。木にするのは画面。F08） |
| `bookmark:add` | R→M | フォルダか URL（http・https だけ）を、親（省略で一番上）の一番下に足す。親がない・フォルダでなければ `not-found` |
| `bookmark:update` | R→M | タイトルか URL を直す（ない id は `not-found`） |
| `bookmark:delete` | R→M | 消す。フォルダは中身もいっしょに（ない id は `not-found`） |
| `bookmark:move` | R→M | 別のフォルダ（`null` なら一番上）の一番下へ移す。自分の中・URL の下へは移せない（`not-found`） |
| `bookmark:importChrome` | R→M | Chrome のプロファイル（3 OS。見つかった最初のもの）から取り込む。結果は `imported`（件数つき）・`not-found`・`unreadable`。ファイルの場所は Renderer から渡さない |
| `bookmark:importHtml` | R→M | Chrome の HTML エクスポートを、Main のファイル選択で選んで取り込む。結果は `imported`・`cancelled`・`unreadable`。20MB まで |
| `download:list` | R→M | ダウンロードの記録（新しい順。`workspaceId` で絞れる。F07） |
| `download:pause` / `download:resume` / `download:cancel` | R→M | 動いているダウンロードの一時停止・再開・取り消し（できたら `true`。終わった・再起動で中断したものは `false`。再開はアプリを起動している間だけ） |
| `download:showInFolder` | R→M | 保存したファイルをフォルダで表示する（記録の id だけを受ける。記録がなければ `false`） |
| `download:changed` | M→R | ダウンロードの進み具合・状態が変わった（画面は `download:list` を読み直す） |
| `permission:list` | R→M | 記憶したサイトの権限（Workspace とサイトと権限ごとの許可・拒否。`workspaceId` で絞れる。F16） |
| `permission:revoke` | R→M | 記憶を取り消す（また未決になり、次に要求されたら確認する）。Workspace・http(s) のサイト・権限の 3 つを渡す。記憶がなければ `false` |
| `permission:prompts` | R→M | 答えを待っている権限の確認（古い順。`id`・`workspaceId`・`origin`・`permission`。T3-7b） |
| `permission:answer` | R→M | 確認に答える（`id` と `allow`・`deny`・`dismissed`）。`allow`・`deny` は記憶し、`dismissed`（今は決めない）は拒否するが記憶しない。ない id・答え終わった id は `false` |
| `permission:promptsChanged` | M→R | 確認が増えた・減った（画面は `permission:prompts` を読み直す）。Workspace を消したとき・ウィンドウを閉じたときは、待っている確認を `dismissed` で終える |
| `omnibox:suggest` | R→M | 統合検索欄の候補（F10）。`query`（2048 文字まで）と今の Workspace の `workspaceId`（なければ null）から、`url`（開く）・今の Workspace のタブ・履歴・ブックマーク・他の Workspace の候補（`otherWorkspace` と `mode` 付き）・`search`（Web 検索）の順に返す。同じ URL は1つにまとめる（タブ > ブックマーク > 履歴）。開くのは Renderer が既存の `tab:*`・`workspace:switch` で行う |
| `history:search` | R→M | 履歴をタイトルと URL の部分一致で探す（新しい順、`workspaceId` で絞れる、`limit` は 1〜100。F09） |
| `history:delete` | R→M | 訪問の時刻（Unix ミリ秒）の範囲 `fromMs`〜`toMs`（両端を含む）を消す。両方省略すると全部。返事は消した訪問の数（F09） |
| `tab:list` | R→M | Workspace のタブ（並び順）と選択中のタブの id（F02。選択中は最後に選んだタブ）。タブが1つもなければ空のタブを開いてから返す。`discardedIds` は、ページの実体の上限（全 Workspace で 30 個）のためにページを破棄したタブ（選ぶと読み込み直す） |
| `tab:create` | R→M | 空のタブを一番右に開いて選ぶ（Cmd/Ctrl+T） |
| `tab:close` | R→M | タブを閉じる（Cmd/Ctrl+W）。選択中を閉じたら、その前に選んでいたタブを選ぶ（使った順）。最後の1つを閉じたら空のタブを開く。閉じた後のタブ列を返す。`workspaceId` とタブの持ち主が違えば `not-found` |
| `tab:reopenClosed` | R→M | 最後に閉じたタブを、閉じたときと同じ「左から何番目」に戻して選ぶ（足りなければ右端。Cmd/Ctrl+Shift+T）。控えは Workspace ごとにメモリだけ、25 個まで。空のタブは積まない。なければ `null` |
| `tab:activate` | R→M | タブを選ぶ。`workspaceId` とタブの持ち主が違えば `not-found` |
| `tab:navigate` | R→M | アドレスバーの入力を開く（F02）。Main が解釈する: 1〜65535 の数字は `http://localhost:<番号>`、「近道のキーワード 語」は近道（settings の shortcuts）、URL らしいものは開き（スキームがなければ https、localhost と IP は http）、それ以外は既定の検索エンジン（Google）で検索。開くのは http・https と `about:blank` だけ |
| `tab:control` | R→M | 戻る・進む・再読み込み・停止（`action`）。ページがまだないタブでは何もしない |
| `startup:mode` | R→M | 起動したときに決めた表示（`restore`: 前回の Workspace とタブ、`developer-home`: Workspace の一覧。F11）。前回の正常な終了（`app_state.last_quit_time_ms`）から設定の `developerHomeAfterMinutes` を超えていたら `developer-home`。`showDeveloperHome` が false・終了の記録がない・前回が異常終了（`clean_exit` が 0）のときは `restore`。返すのは起動して最初の1回だけで、その後（macOS でウィンドウを開き直したときなど）は `restore` |
| `view:setBounds` | R→M | ページを表示する場所（Renderer の空の div の位置と大きさ、整数の CSS ピクセル。ADR-008）。UI のズームは 1 のままにする前提（変えるなら Main で倍率を掛ける） |
| `tab:pageChanged` | M→R | ページの URL・タイトル・戻る/進むの可否・読み込み中が変わった（タブの id と一緒に）。読み込みに失敗したときは `error`（`kind`: `offline`・`certificate`・`load-failed`、`url`、`description`）が付く。そのタブのページの実体は隠され、Renderer が同じ場所にエラー画面を出す（F16） |
| `tab:listChanged` | M→R | Renderer の invoke ではない理由でタブ列が変わった（ページの `window.open`・`target=_blank` を新しいタブで開いた、メニューのショートカット）。Workspace の id。ページが開く新しいタブは http・https だけで、直前のユーザーの入力1回につき1つ（ポップアップブロッカーの代わり）。Cmd/Ctrl+クリック・中クリックは選ばずに開く |
| `ui:command` | M→R | メニューのショートカットのうち画面で行うもの（`focus-address-bar`: Cmd/Ctrl+L、`focus-search`: Cmd/Ctrl+K、`toggle-side-panel`: Cmd/Ctrl+B で左パネルの2段目を畳む・開く、`bookmark-page`: Cmd/Ctrl+D で今のページをブックマークに足す）。ショートカットはメニューの accelerator で受ける。Cmd/Ctrl+T・W・Shift+T は、ページが keydown を止めても効くよう、ページの `before-input-event` でも先に受ける（Chrome と同じ予約キー） |

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
