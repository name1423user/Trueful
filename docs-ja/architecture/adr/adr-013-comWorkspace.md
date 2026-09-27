# ADR-013: COM側Workspaceマニフェストの責務を最小化する

- **Status**: 採用
- **Date**: 2026-08-17
- **関連**: ADR-011, ADR-012

## Context

Workspace管理の実装フェーズに入り、`services/workspaceFile.ts`が扱う「COM側json(システム管理用マニフェスト)」の中身を具体的に決める必要が生じた。

候補として、`status`(active/dormant)、`lastUsedTimeMs`、保存先パス(`fileSaveRoot`)、ファイル自身のハッシュ値などが挙がったが、これらはいずれもすでに別の層(SQLite側、書き込み処理の呼び出し側、バックアップ処理)が責務として持ちうる情報であり、COM側jsonに含めるべきかどうかの判断基準が定まっていなかった。

あわせて、`services`と`flows`の役割分担について、開発者自身の記憶が「services=servicesの集大成」「flows=こまごまとした操作」という、当初の定義(ADR-011前後で確立した定義)と逆になっている場面があり、これを機に再確認した。

## Decision

COM側jsonマニフェストの責務を「システムが機械的に管理する最小限の識別情報」のみに限定し、初期実装では`{ id: number }`のみを持たせる。`status`・`lastUsedTimeMs`・保存先パス・ハッシュ値はいずれもCOM側jsonには含めない。

あわせて、Workspace関連のバックアップレコードは新規IDを発行せず、`Workspace.id`をそのまま外部キーとして流用する。

## Rationale

- **Source of truthの一本化**: `status`・`lastUsedTimeMs`はSQLiteの`workspace`テーブルが正として持つ情報であり、COM側jsonにも同じ情報を持たせると、同期がズレたときにどちらが正しいか判断できなくなる。「新規作成時にdormantで作りたい」といった要求は、`flows/createWorkspace`が受け取る引数として扱えば十分で、データの重複保持は不要
- **関心の分離**: 保存先パス(`fileSaveRoot`)は「データがどこに置かれるか」という、書き込み処理を呼び出す側の関心事であり、データそのものが自分の置き場所を知っている必要はない
- **原理的な制約**: ハッシュ値は対象ファイルの中身が確定してから計算できるものであり、`buildComWorkspaceData`(データ組み立て段階の関数)の時点ではまだファイルが存在しないため、自分自身のハッシュを自分の中に含めることはできない
- **拡張性の確保**: 現時点で`id`以外の項目がないとしても、COM側json自体は将来「システムだけが管理すべき情報」が増える可能性を見込んで、専用ファイルの形は維持する(Layer 2: Technical Freedomに紐づく判断として、将来の要件変化に対して構造を閉じない選択)

## Alternatives Considered

| 選択肢 | 評価 | 却下理由 |
| --- | --- | --- |
| **COM側jsonは`{ id: number }`のみ** | ○ | （採用） |
| COM側jsonに`status`/`lastUsedTimeMsも含める` | ✕ | DBと二重管理になり、source of truthが曖昧になる |
| COM側jsonに`fileSaveRoot`を含める | ✕ | 保存先は呼び出し側の関心事であり、データ自身の情報ではない |
| COM側jsonにハッシュ値を含める | ✕ | 書き込み前の段階では対象ファイルが存在せず、原理的に計算できない |
| バックアップに新規IDを発行する | ✕ | `Workspace.id`で紐付けとして十分機能し、新しい概念を増やす理由がない |

## Consequences

**得られるもの**

- COM側json・SQLite・USER側jsonの3層で「どの情報がどこに属するか」が明確になり、今後の実装で情報の置き場所に迷う場面が減る
- バックアップテーブルの紐付けキーがシンプルになり、ID管理の複雑さが増えない

**引き受けるもの**

- COM側jsonが現状`id`のみとなり、「本当に別ファイルに分ける必要があるのか」という疑問が今後再燃する可能性がある。専用ファイルとして残す判断の妥当性は、将来COM側専用の項目が実際に増えるかどうかで検証されることになる

**影響範囲**

- `services/workspaceFile.ts`(`buildComWorkspaceData`の実装方針)
- `flows/createWorkspace.ts`(USER側jsonのテンプレコピー・初期値上書き処理をここに集約する判断も、本ADRと同時に確定した)

## 再検討条件

COM側専用の管理情報(例: ファイルフォーマットのバージョン番号、マイグレーション履歴など)が具体的に必要になった時点で、`buildComWorkspaceData`の戻り値の型を拡張する。逆に、`id`以外の項目が長期間発生しない場合、COM側jsonをUSER側jsonに統合する再設計も選択肢に入れる。

## References

- ADR-011, ADR-012(Workspace管理設計の前提)

---

> [!NOTE]
> このADRはClaudeに一次稿を作成させ、内容を確認・修正したものです。記載された技術的判断そのものは著者が行っています。AIの利用方針は [番外編1](https://qiita.com/Ruria1024/items/30a1a08137941843355b) を参照してください。
