# T1-3a SQLite 実装の比較（better-sqlite3 / node:sqlite）結果

- 作成: 2026-09-28。
- 改訂: 同日。
  - 改訂の理由: 最初の版は、better-sqlite3 を「毎回ソースからビルドする」と誤って書いていた。実際には、ビルド済みのバイナリを同梱している。別の文脈のレビューで見つかった。
  - 直したこと: 計測をやり直し、4章・5章を書き直した。

## 1. 環境
| 項目 | 値 |
|---|---|
| 実施日 | 2026-09-28 |
| 実施者 | Claude Code（GitHub Actions の CI で計測） |
| OS / CPU | macos-latest（darwin-arm64）、windows-latest（win32-x64）、ubuntu-latest（linux-x64） |
| Electron / Node | Electron 44.4.5 / Node 24.21.0（Electron に入っている Node） |
| ライブラリの版 | better-sqlite3 13.0.3。SQLite はどちらも 3.53.4 |
| CI の記録 | [run 36394594500](https://github.com/name1423user/Trueful/actions/runs/36394594500)（結果の JSON は artifact） |

## 2. 手順
1. `.github/workflows/spike-sqlite.yml` が、3 OS で次を順に実行する。
   1. `pnpm install --frozen-lockfile`。better-sqlite3 の node-gyp は `allowBuilds: false` で実行しない。
   2. `node bench.mjs --label=node24`（素の Node 24。参考）
   3. `electron . --label=electron44`（Electron 44 の Main プロセス）
2. 計測の中身（`bench.mjs`）。2つの実装に、同じ SQL を同じ順で実行させる。
   - 一時ファイルの DB を作る。設定は `journal_mode = WAL`、`synchronous = NORMAL`。
   - `history` 風のテーブルと、索引を2つ作る。
   - 1万件を、1回のトランザクションで挿入する。
   - `url` の完全一致の検索を 1,000 回、`title LIKE '%…%'` の検索を 100 回行う。
   - 件数が合わなければエラーにする。
   - 実行順の影響を減らすため、1回ずつ試しに動かしてから、2つを交互の順（AB、BA、…）で7回ずつ測る。中央値・最小・最大を出す。
   - better-sqlite3 は、読み込んだ `.node` ファイルの場所も記録する。

## 3. 結果
記号: ◯ 動く / △ 条件付きで動く / × 動かない / － 未実施

### 3-1. ビルドと読み込み
| 確認項目 | node:sqlite | better-sqlite3 | 証拠 |
|---|---|---|---|
| 3 OS の CI でのインストール | ◯ インストールなし（Node に組み込み） | ◯ ビルドなしで入る。パッケージは 11.4MB で、8種類のビルド済みバイナリを同梱（darwin・linux・linuxmusl・win32 × x64・arm64）。インストール時スクリプトはない（`"gypfile": false`） | install のログ（Windows でも 0.6 秒） |
| Electron 44 での読み込み | ◯ | ◯ 3 OS とも、同梱の `prebuilds/<os>-<arch>.node` を読み込んだ | 結果の「バイナリ」列 |
| Electron 向けの再ビルドの要否 | 不要 | **不要**。同梱のバイナリは N-API 10（Node の版に依存しない ABI）なので、Electron 44 でもそのまま読める | 同上 |
| C++ のビルド環境 | 不要 | 不要（同梱のバイナリがない OS やアーキテクチャのときだけ要る） | `binding.gyp` と `lib/binding.js` |
| 安定度 | Stability 1.2「Release candidate」（v24.15.0 から）。ExperimentalWarning は出ない | 安定版（13.0.3） | [Node 24.21.0 の文書](https://nodejs.org/docs/v24.21.0/api/sqlite.html)、結果の「警告: なし」 |

### 3-2. 時間（Electron 44、7回の中央値。かっこ内は最小〜最大、ミリ秒）
| OS | 実装 | 挿入1万件 | 完全一致1,000回 | LIKE 100回 |
|---|---|---|---|---|
| macOS | node:sqlite | 19.7（18.3〜27.0） | 2.9（2.7〜4.2） | 60.1（54.6〜87.8） |
| macOS | better-sqlite3 | 22.2（20.0〜29.8） | 2.9（2.5〜17.1） | 60.4（57.0〜65.6） |
| Windows | node:sqlite | 27.8（27.0〜35.9） | 5.6（5.1〜5.8） | 84.7（83.8〜95.2） |
| Windows | better-sqlite3 | 36.1（35.9〜36.6） | 5.6（5.2〜5.9） | 85.9（85.5〜94.5） |
| Ubuntu | node:sqlite | 14.1（13.8〜14.5） | 3.2（3.1〜3.2） | 36.1（35.1〜36.7） |
| Ubuntu | better-sqlite3 | 17.7（17.1〜18.2） | 3.2（3.1〜3.3） | 34.4（34.0〜35.3） |

参考（素の Node 24、中央値。挿入 / 完全一致 / LIKE）:

| OS | node:sqlite | better-sqlite3 |
|---|---|---|
| macOS（Node 24.20.0） | 25.9 / 3.4 / 81.3 | 30.9 / 3.2 / 68.4 |
| Windows | 29.2 / 5.6 / 82.4 | 39.4 / 5.8 / 89.0 |
| Ubuntu | 13.3 / 3.2 / 33.4 | 16.9 / 3.2 / 34.5 |

## 4. 所見
- **速さの差は、実用上ない。**
  - 挿入: node:sqlite が Windows と Ubuntu で 2〜3 割速く、最小〜最大の幅も重ならなかった。macOS では幅が重なっていて、差があるとは言えない。
  - 検索: 完全一致・LIKE とも同じくらいだった。
  - どちらも、1万件の挿入が 40ms 以内。Trueful の用途（履歴・タブ・設定）では差にならない。
- **better-sqlite3 は、ビルドも再ビルドも要らなかった。** 13.0.3 は OS・アーキテクチャごとの N-API のバイナリを同梱していて、Electron 44 でもそのまま読み込めた。C++ のツールも、`allowBuilds` での許可も要らない（許可すると、何もしない node-gyp が走って遅くなるだけ）。
- **2つの本当の違い**
  - 依存: better-sqlite3 は、ネイティブのコードを含む npm の依存が1つ増える（11.4MB。配布物には、使う OS のバイナリだけを入れればよい）。node:sqlite は依存ゼロ。
  - SQLite の更新: node:sqlite の SQLite は、Electron（Node）の版と一緒に上がる。better-sqlite3 の SQLite は、better-sqlite3 を上げたときに上がる。
  - 安定度: better-sqlite3 は安定版で、実績が長い。node:sqlite は Release candidate で、Electron を上げたときに API が小さく変わる可能性がある。
- **使う API はほぼ同じ形だった。** 今回使ったのは `prepare`、`run`・`get`・`all`、`exec`、`close` で、`bench.mjs` は2つを同じコードで扱えた。バックアップの機能も、どちらにもある（`sqlite.backup()` / `db.backup()`）。
- ADR-002 は、better-sqlite3 の採用を決めている。

## 5. 推奨
**どちらでも T1-3 は進められる。僅差で node:sqlite を推す。** 決めるのは、るりあ（SPEC 11章）。
- **node:sqlite を推す理由**
  - 依存がゼロになる。Trueful は依存の汚染を気にしている（CI の SHA 固定、`allowBuilds`）ので、ネイティブのコードを含む依存を1つ減らせるのは効く。
  - SQLite の更新が、どのみち上げる Electron の更新に付いてくる。
- **node:sqlite のリスクと、その対策**
  - リスク: Release candidate なので、API が変わる可能性がある。
  - 対策: DB に触るコードを `app/src/main/db/` の薄い層に閉じ込める。Electron を上げるときは CI の単体テストで気づけるので、直す場所は1か所で済む。
- **better-sqlite3 を選ぶ場合**
  - ADR-002 のまま進められる。
  - ビルドの手間はないので、`allowBuilds` には `false` と書くだけでよい。
  - `electron-builder` の配布物に、ほかの OS のバイナリが入らないようにする設定が要る。
- **node:sqlite に決めた場合に直すもの**
  - SPEC 4章の DB の行（「`node:sqlite`（Electron 44 の Node 24.21 に組み込み、Stability 1.2）」）
  - ADR-002（CLAUDE.md の「ADR と異なる判断」なので、改訂の前に確認する）
