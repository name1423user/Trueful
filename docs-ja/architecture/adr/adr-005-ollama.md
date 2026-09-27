# ADR-005：Ollama既定（ローカルAI）

**ステータス**：決定済み

## 決定

ローカルAI推論のデフォルトエンジンを Ollama とする。

## 理由

- Local First（#11）に直結
- 既存Discord bot開発のパターンを流用できる
- 追加コストゼロでプライバシーも確保できる

## AI Provider Interface

```ts
interface AIProvider {
  generate(prompt: string, options?: object): Promise<string>
  summarize(text: string, options?: object): Promise<string>
  extract(text: string, schema: object): Promise<object>
  classify(input: string, categories: string[]): Promise<string>
  embed(text: string): Promise<number[]>
  tokenize(text: string): Promise<number>
  cancel(requestId: string): void
}
```

`OllamaProvider`（既定）と `CloudProvider`（Claude API、opt-in）は共にこのインターフェースを実装する。AI Brokerはこのインターフェース越しにのみAIへアクセスし、具体的なエンジンを意識しない。

`embed()`（将来の履歴セマンティック検索用）と `tokenize()`（コンテキスト長管理用）を含む。OpenAI/Gemini等の追加プロバイダーはこのインターフェースを満たせば差し替え可能だが、実装自体はPhase 3以降のスコープとする（Phase 1/2はOllama＋Claude APIのみ）。

## モデル管理

- 初回起動時、Ollama未インストール/モデル未取得の場合は一度きりのセットアップ画面（進捗バー付き）を表示
- コンテキストウィンドウの管理は `tokenize()` を用い、モデルのネイティブウィンドウ上限に収まるようDOM/Networkスナップショットを切り詰める
- Storage & Cleanupパネル（設定画面）：Electronキャッシュ・Ollamaモデル・スナップショットの使用容量をそれぞれ表示し、カテゴリ単位でワンクリック削除できるガベージコレクション機能を提供する（Failure Friendly：自動削除ではなくユーザー操作起点）

関連: [Roadmap: MVPスコープ](../../roadmap/mvp-scope.md)
