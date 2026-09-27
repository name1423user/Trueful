# ADR-008：WebContentsView採用（BrowserViewから改訂）

**ステータス**：決定済み（2026-09-27 改訂）

## 決定

タブ表示に WebContentsView を採用する。BrowserView と `<webview>` タグは使わない。

- ウィンドウは BaseWindow（または BrowserWindow）で作り、タブのページ、検索候補の一覧など Web の内容を持つ部品は、それぞれ WebContentsView として `contentView.addChildView()` で重ねる。後から追加したものほど手前に描かれる。
- Renderer（React の UI）は WebContentsView を描画しない。WebContentsView を置きたい場所に空の要素を置き、その位置と大きさを IPC で Main に報告する。Main が `setBounds()` で合わせる。
- Workspace ごとの session partition は、WebContentsView の `webPreferences.session` で指定する。

## 理由

- BrowserView は Electron 30 で非推奨になり、WebContentsView が後継になった。Electron 44 に追従するため（SPEC 11章「BrowserView→WebContentsView」）。
- `<webview>` を使わない理由は改訂前と同じ。Electron 公式が非推奨の方向で、性能とセキュリティに既知の課題が多い。
- WebContentsView は、BrowserView と同じくネイティブなプロセス分離を持ち、Workspace ごとの session partition と自然に組み合わせられる。
- M0 の試作で確かめた（2026-09-27）:
  - T0-1〜T0-5 の試作は、すべて BaseWindow と WebContentsView で、`sandbox: true`・`contextIsolation: true` のまま作り、起動できた。各試作の機能の結果は、それぞれの RESULT.md に書く（実機確認が済んでいないものもある）。
  - 検索候補の一覧を専用の WebContentsView にして最後に `addChildView` すると、ページの上に重なった。自動の確認では、候補の更新・上下キー・Esc が動いた（`spikes/omnibox-popup/RESULT.md`）。重なりとウィンドウの移動・リサイズへの追従の実機確認は、この改訂の時点ではまだ記録されていない。
  - Chromium の PDF ビューアは、WebContentsView の中で表示できた（`spikes/pdf/RESULT.md`。検索と印刷には条件がある）。

## 注意点（試作で分かったこと）

- 各 WebContentsView は、読み込みを終えたときにフォーカスを取る。入力欄のフォーカスが、あとから読み込みを終えたページに奪われないようにする。
- BaseWindow には `capturePage()` がない。画面の記録は WebContentsView ごとに行う。

## 改訂履歴

- 2026-09-27：BrowserView から WebContentsView に改訂（T1-1a）。改訂前の決定は「タブ表示に BrowserView を採用し、`<webview>` タグは使わない」。
