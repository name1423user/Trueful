# T1-3a SQLite 実装の比較（better-sqlite3 / node:sqlite）結果

## 1. 環境
| 項目 | 値 |
|---|---|
| 実施日 | 2026-09-28 |
| 実施者 | Claude Code（GitHub Actions の CI で計測） |
| OS / CPU | macos-latest（darwin-arm64）、windows-latest（win32-x64）、ubuntu-latest（linux-x64） |
| Electron / Node | Electron 44.4.5 / Node 24.21.0（Electron に入っている Node） |
| ライブラリの版 | better-sqlite3 13.0.3、@electron/rebuild 4.2.0。SQLite はどちらも 3.53.4 |
| CI の記録 | [run 36393660465](https://github.com/name1423user/Trueful/actions/runs/36393660465)（結果の JSON は artifact） |

## 2. 手順
1. `.github/workflows/spike-sqlite.yml` が、3 OS で次を順に実行する。
   1. `pnpm install --frozen-lockfile`
   2. `node bench.mjs --label=node24`（素の Node 24。参考）
   3. `electron . --label=before-rebuild`（better-sqlite3 は素の Node 向けにビルドされたまま）
   4. `electron-rebuild --force --only better-sqlite3`
   5. `electron . --label=after-rebuild`
2. 計測の中身（`bench.mjs`）。2つの実装に、同じ SQL を同じ順で実行させる。
   - 一時ファイルの DB を作る。設定は `journal_mode = WAL`、`synchronous = NORMAL`。
   - `history` 風のテーブルと、索引を2つ作る。
   - 1万件を、1回のトランザクションで挿入する。
   - `url` の完全一致の検索を 1,000 回、`title LIKE '%…%'` の検索を 100 回行う。
   - これを5回繰り返し、中央値を取る。件数が合わなければエラーにする。

## 3. 結果
記号: ◯ 動く / △ 条件付きで動く / × 動かない / － 未実施

### 3-1. ビルドと読み込み
| 確認項目 | node:sqlite | better-sqlite3 | 証拠 |
|---|---|---|---|
| 3 OS の CI でのビルド | ◯ ビルドなし（Node に組み込み） | ◯ 3 OS ともソースからビルドできた（CI には C++ のビルド環境がある） | CI のログ |
| Electron 44 での読み込み（再ビルドなし） | ◯ | ◯ 3 OS とも読み込めた | `before-rebuild` の結果 |
| Electron 向けの再ビルドの要否 | 不要 | **不要**（N-API 10 を使っているため）。再ビルドしても結果は同じ。再ビルドにかかった時間は 1〜5 秒 | `after-rebuild` の結果 |
| インストール時のビルド | なし | **毎回ソースからビルドする**（ビルド済みのバイナリを配っていない。Windows の CI では MSBuild で約 46 秒） | install のログ |
| 安定度 | Stability 1.2「Release candidate」（v24.15.0 から）。ExperimentalWarning は出ない | 安定版（13.0.3） | [Node 24.21.0 の文書](https://nodejs.org/docs/v24.21.0/api/sqlite.html)、`警告: なし` |

### 3-2. 時間（Electron 44、再ビルド前、5回の中央値、ミリ秒）
| OS | 実装 | 挿入1万件 | 完全一致1,000回 | LIKE 100回 |
|---|---|---|---|---|
| macOS | node:sqlite | 33.9 | 6.2 | 97.7 |
| macOS | better-sqlite3 | 32.4 | 5.4 | 89.4 |
| Windows | node:sqlite | 27.4 | 5.2 | 78.7 |
| Windows | better-sqlite3 | 35.6 | 5.2 | 80.8 |
| Ubuntu | node:sqlite | 17.9 | 2.6 | 46.3 |
| Ubuntu | better-sqlite3 | 21.4 | 2.4 | 45.5 |

参考（再ビルド後の Electron と、素の Node 24）:

| OS | 条件 | node:sqlite（挿入 / 完全一致 / LIKE） | better-sqlite3（挿入 / 完全一致 / LIKE） |
|---|---|---|---|
| macOS | 再ビルド後 | 45.6 / 6.8 / 116.8 | 52.6 / 5.1 / 127.2 |
| Windows | 再ビルド後 | 27.1 / 5.1 / 78.6 | 35.8 / 5.1 / 80.4 |
| Ubuntu | 再ビルド後 | 17.8 / 2.6 / 46.9 | 21.2 / 2.4 / 45.2 |
| macOS | 素の Node 24.20.0 | 27.4 / 5.1 / 92.3 | 46.6 / 6.5 / 107.6 |
| Windows | 素の Node 24.21.0 | 28.8 / 5.4 / 78.2 | 37.2 / 5.5 / 80.6 |
| Ubuntu | 素の Node 24.21.0 | 16.6 / 2.6 / 44.5 | 21.2 / 2.7 / 46.5 |

## 4. 所見
- **速さの差は小さい。** 挿入は node:sqlite が 0〜25% 速く、検索は同じくらいだった。どちらも1万件の挿入が 50ms 以内で、Trueful の用途（履歴・タブ・設定）では差にならない。macOS の CI は同じ条件でも 3〜4 割ぶれるので、macOS の数字は目安とする。
- **better-sqlite3 の再ビルドは要らなかった。** 13.0.3 は N-API 10（Node のバージョンに依存しない ABI）でビルドされるので、Node 24 向けに作ったものが Electron 44 でもそのまま読み込めた。SPEC の「再ビルドの要否」は、この版では「不要」になる。
- **ただし、better-sqlite3 は毎回ソースからビルドする。** 開発する Mac に Xcode Command Line Tools、Windows に Visual Studio の C++ ツールが必要になる。pnpm 12 の `allowBuilds` で許可する必要もある。配布（electron-builder）では、アーキテクチャごと（arm64・x64）にビルドし直す手間が残る。
- **node:sqlite は、依存もビルドも要らない。** Electron の版を上げると、SQLite と node:sqlite の版も一緒に変わる。今は Release candidate なので、API が小さく変わる可能性がある。ただ、使うのは `DatabaseSync`、`prepare`、`run`・`get`・`all`、`exec` だけで、better-sqlite3 とほぼ同じ形だった（`bench.mjs` は2つを同じコードで扱えた）。バックアップには `sqlite.backup()` がある。
- ADR-002 は better-sqlite3 の採用を決めている。node:sqlite を選ぶなら、ADR-002 を改訂する必要がある（CLAUDE.md の「ADR と異なる判断」なので、先に確認する）。

## 5. 推奨
**node:sqlite を推奨する（続行）。** 決めるのは、るりあ（SPEC 11章）。
- 理由: 速さは同じくらいで、ネイティブのビルドとインストール時スクリプトが要らない。そのため、開発環境・CI・配布が単純になり、依存の汚染の心配も1つ減る。Release candidate の不安定さは、DB へのアクセスを `app/src/main/db/` の薄い層に閉じ込めれば、変更があっても直す場所は1か所で済む。
- better-sqlite3 を選ぶ場合: 再ビルドは不要なので、`app/electron-builder.yml` の `npmRebuild: false` のままでよい。代わりに、`allowBuilds` への追加と、開発環境の C++ ツールの前提を README に書く必要がある。
- SPEC に反映する案:
  - 4章の DB の行を「`node:sqlite`（Electron 44 の Node 24.21 に組み込み、Stability 1.2）」にする。
  - ADR-002 を改訂する。
