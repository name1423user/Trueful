# M0 試作のまとめ（デモ用の下書き）

- 作成: 2026-09-27 15:25 JST（Claude Code）。T0-2・T0-5 の実機確認と、T0-4 の push 方式の確認が終わったら更新する。
- 使い方: M0 のデモで、るりあが R1〜R6 の対応（続行 / 合格ラインの見直し / 代替案）を決め、SPEC 11章に記録する（PLAN の「M0 のデモ」）。

## 1. 一覧
| # | リスク | 状態 | 結果の要約 | 推奨 |
|---|---|---|---|---|
| R1 | Google ログインの拒否 | 済（macOS） | UA のままでも `Electron/` を除いても、ログインでき、再起動後も保持された。`Electron/` があると簡易版のログイン画面になる | 続行。UA は `Electron/` を除く |
| R2 | MV3 拡張が動かない | 実機確認待ち | 試作は用意済み。Electron 44 はサイドパネル（`chrome.sidePanel`）に未対応。ストアの拡張（MV3）には `chrome.webRequest` が届かない（R5 の調査） | 実機確認の後に判断 |
| R3 | PDF 表示 | 済（macOS） | URL・ローカルとも、表示・拡大・検索・印刷ができた。`plugins` の設定は不要。アプリのズームは PDF に効かず、検索はビューアの画面の文字にも当たる。印刷プレビューはない | 続行。PDF.js は不要 |
| R4 | 検索候補の重ね表示 | overlay は済、push は確認中 | overlay 方式で、候補の更新・上下キー・Esc・移動とリサイズ・フォーカスの5点が動いた。最初の1回の表示だけ 22〜37ms かかる | （push の確認後に記入）overlay 方式が有力 |
| R5 | 広告ブロックと拡張の衝突 | 実機確認待ち（自動の調査は済） | MV2 の拡張では、Ghostery を有効にすると `chrome.webRequest` が止まる（仮説どおり）。MV3 の拡張には、広告ブロックと関係なく `chrome.webRequest` が届かない。Ghostery は2つめのセッションで有効にできない | 実機確認の後に判断 |
| R6 | パスキーが使えない | T0-1 で発見 | 未署名の試作では、パスキーの画面は出るが Touch ID のダイアログが出ない。署名したアプリでは未確認 | 確かめる試作を足すかを決める |

## 2. SPEC 11章の決定との照合
| SPEC の決定 | 試作の結果との関係 |
|---|---|
| 広告ブロックは内蔵 | Ghostery は動く。ただし2つめのセッションで有効にできないので、Workspace ごとのセッションに対応させる工夫が要る（R5） |
| 内蔵広告ブロックを拡張の `chrome.webRequest` より優先 | 後押しする結果。MV3 の拡張には、そもそも `chrome.webRequest` が届かない。優先しても、ストアの拡張が新たに困ることはない |
| パスワード管理は拡張単体で動けば合格 | T0-2 の実機確認で判断する。ライブラリにはネイティブメッセージングの実装がある |
| BrowserView → WebContentsView | T0-1〜T0-5 はすべて WebContentsView で作った。重ね表示（R4）も WebContentsView で動いた |
| ライセンスは GPL-3.0 | `electron-chrome-extensions` のライセンス（GPL-3.0 か有料）と一致する |

## 3. 決めてほしいこと（デモで）
1. R1・R3 を「続行」で確定するか。
2. R4 で overlay 方式を採るか（push 方式の結果を見てから）。
3. R6（パスキー）を確かめる試作を PLAN に足すか。足すなら、署名したアプリが必要。
4. ストアの拡張（MV3）の `chrome.webRequest` が動かないことを、R2 の合格ラインでどう扱うか。候補: 「一部動きません」と表示する / 自前で肩代わりを作る（内蔵広告ブロックと両立しない）/ Electron の対応を待つ。
5. Ghostery を Workspace ごとのセッションで使う方法を、T3-5（内蔵広告ブロック）で設計するか。

## 4. 本体の開発に引き継ぐこと
- UA から `Electron/` を除く（R1）。
- PDF の拡大はビューアのボタンで行う。Cmd/Ctrl+= をどうするか、検索バーが PDF でビューアの文字にも当たることを F06 で扱う（R3）。
- 統合検索欄: 読み込みを終えたページがフォーカスを奪うので、すべての読み込みの後に検索欄へフォーカスする。候補の行をクリックした後は検索欄へ戻す。日本語入力の変換中の Enter・上下キー・Esc を候補の操作に回さない（`isComposing` を見る）。候補一覧の View は先に表示しておき、最初の表示の遅れをなくす（R4）。
- `session.clearData()` では拡張の service worker が消えない。拡張の管理（T3-6）で、登録を確実に消す方法を確かめる（R5 の調査）。
- 試作の起動: pnpm 12 では `onlyBuiltDependencies` が効かず、Electron 本体が入らない。本体では、pnpm 12 での正しい設定を T1-1 で確かめる。

## 5. 各試作の結果
- R1: [spikes/google-login/RESULT.md](google-login/RESULT.md)
- R2: [spikes/extensions/RESULT.md](extensions/RESULT.md)
- R3: [spikes/pdf/RESULT.md](pdf/RESULT.md)
- R4: [spikes/omnibox-popup/RESULT.md](omnibox-popup/RESULT.md)
- R5: [spikes/adblock-extensions/RESULT.md](adblock-extensions/RESULT.md)、[調査](webrequest-probe/RESULT.md)
