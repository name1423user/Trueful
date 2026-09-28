import { WebContentsView, type BaseWindow, type Rectangle, type WebContents } from 'electron'
import { isAllowedPageUrl } from './urlInput'

// ページの様子（Renderer のアドレスバーと戻る・進むのボタンに使う）
export type PageState = {
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
}

type Handlers = {
  // ページの URL・タイトル・読み込み中が変わった。committed は、移動が確定した・タイトルが変わったとき
  // （読み込みの開始・終了の知らせでは、URL はまだ前のページのことがある）
  onPageChanged: (tabId: number, page: PageState, committed: boolean) => void
  // ページが新しいウィンドウで開こうとした（target=_blank・window.open）。http・https のときだけ呼ぶ
  onOpenRequest: (tabId: number, url: string) => void
}

// タブのページを WebContentsView で表示する（ADR-008）。表示するのは1つだけで、ほかは外しておく。
// Workspace ごとのパーティション persist:workspace-<id> を使う（ログインを Workspace で分ける。F03）。
// 実体の数の上限（30個）は T2-5 で扱う
export class TabViews {
  private readonly views = new Map<number, WebContentsView>()
  private shown: number | undefined
  private bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
  // 権限のハンドラを設定したパーティション（1つのセッションに1回だけ設定する）
  private readonly guarded = new Set<string>()

  constructor(
    private window: BaseWindow,
    private readonly handlers: Handlers
  ) {}

  // ウィンドウを閉じたら、すべてのページを破棄する（WebContentsView のページは、ウィンドウを閉じても
  // 自動では消えず、見えないまま動き続けるため）。開き直したウィンドウには attach で付け直す
  destroyAll(): void {
    for (const id of [...this.views.keys()]) this.destroy(id)
  }

  attach(window: BaseWindow): void {
    this.destroyAll()
    this.window = window
  }

  // そのタブのページを表示する（なければ作って url を読み込む）
  show(tab: { id: number; workspaceId: number; url: string }): void {
    if (this.window.isDestroyed()) return
    let view = this.views.get(tab.id)
    if (!view) {
      view = this.create(tab.id, tab.workspaceId)
      // DB の URL も、読み込む前に確かめる（多層防御）
      const url = isAllowedPageUrl(tab.url) ? tab.url : 'about:blank'
      void view.webContents.loadURL(url).catch(() => {})
    }
    if (this.shown !== undefined && this.shown !== tab.id) {
      const previous = this.views.get(this.shown)
      if (previous) this.window.contentView.removeChildView(previous)
    }
    this.window.contentView.addChildView(view)
    view.setBounds(this.bounds)
    this.shown = tab.id
  }

  // 表示する場所（Renderer の空の div の位置と大きさ。ADR-008）
  setBounds(bounds: Rectangle): void {
    this.bounds = bounds
    if (this.shown !== undefined) this.views.get(this.shown)?.setBounds(bounds)
  }

  webContents(tabId: number): WebContents | undefined {
    return this.views.get(tabId)?.webContents
  }

  // タブを閉じたとき
  destroy(tabId: number): void {
    const view = this.views.get(tabId)
    if (!view) return
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
    this.views.delete(tabId)
    if (this.shown === tabId) this.shown = undefined
  }

  private create(tabId: number, workspaceId: number): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        // セキュリティの設定は無効にしない（CLAUDE.md）。ページには preload を渡さない
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: `persist:workspace-${workspaceId}`
      }
    })
    const wc = view.webContents
    // ページのカメラ・通知などの権限は、F16（サイトの権限）ができるまで、すべて拒否する（パーティションごとに1回）
    const partition = `persist:workspace-${workspaceId}`
    if (!this.guarded.has(partition)) {
      wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
      wc.session.setPermissionCheckHandler(() => false)
      this.guarded.add(partition)
    }
    // 閉じた後に届いた知らせは捨てる（破棄した webContents を触ると例外になる）
    const notify = (committed: boolean) => (): void => {
      if (wc.isDestroyed() || this.views.get(tabId) !== view) return
      this.handlers.onPageChanged(
        tabId,
        {
          url: wc.getURL(),
          title: wc.getTitle(),
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
          loading: wc.isLoading()
        },
        committed
      )
    }
    wc.on('did-start-loading', notify(false))
    wc.on('did-stop-loading', notify(false))
    wc.on('did-navigate', notify(true))
    wc.on('did-navigate-in-page', notify(true))
    wc.on('page-title-updated', notify(true))
    // メインフレームは http・https・about:blank 以外（file:・blob:・data: など）へ移動しない。
    // サブフレームの移動は Chromium の制限（file: など）と、権限の全拒否（外部プロトコル）に任せる
    const guard = (event: Electron.Event<{ url: string }>): void => {
      if (!isAllowedPageUrl(event.url)) event.preventDefault()
    }
    wc.on('will-navigate', guard)
    wc.on('will-redirect', guard)
    // 新しいウィンドウは開かず、同じ Workspace の新しいタブで開く
    wc.setWindowOpenHandler(({ url }) => {
      if (isAllowedPageUrl(url)) this.handlers.onOpenRequest(tabId, url)
      return { action: 'deny' }
    })
    this.views.set(tabId, view)
    return view
  }
}
