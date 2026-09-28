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
  // ページの URL・タイトル・読み込み中が変わった
  onPageChanged: (tabId: number, page: PageState) => void
}

// タブのページを WebContentsView で表示する（ADR-008）。表示するのは1つだけで、ほかは外しておく。
// Workspace ごとのパーティション persist:workspace-<id> を使う（ログインを Workspace で分ける。F03）。
// 実体の数の上限（30個）は T2-5 で扱う
export class TabViews {
  private readonly views = new Map<number, WebContentsView>()
  private shown: number | undefined
  private bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }

  constructor(
    private readonly window: BaseWindow,
    private readonly handlers: Handlers
  ) {}

  // そのタブのページを表示する（なければ作って url を読み込む）
  show(tab: { id: number; workspaceId: number; url: string }): void {
    // ウィンドウを閉じた後（macOS でアプリが残っているとき）は何もしない。ウィンドウを開き直したときの表示は、
    // 複数ウィンドウ（Phase 2）と合わせて決める
    if (this.window.isDestroyed()) return
    let view = this.views.get(tab.id)
    if (!view) {
      view = this.create(tab.id, tab.workspaceId)
      void view.webContents.loadURL(tab.url).catch(() => {})
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
    this.window.contentView.removeChildView(view)
    view.webContents.close()
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
    // ページのカメラ・通知などの権限は、F16（サイトの権限）ができるまで、すべて拒否する
    wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    wc.session.setPermissionCheckHandler(() => false)
    const notify = (): void =>
      this.handlers.onPageChanged(tabId, {
        url: wc.getURL(),
        title: wc.getTitle(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        loading: wc.isLoading()
      })
    for (const event of [
      'did-start-loading',
      'did-stop-loading',
      'did-navigate',
      'did-navigate-in-page',
      'page-title-updated'
    ] as const) {
      wc.on(event as 'did-start-loading', notify)
    }
    // http・https 以外（file: など）へは移動しない
    const guard = (event: Electron.Event<{ url: string }>): void => {
      if (!isAllowedPageUrl(event.url)) event.preventDefault()
    }
    wc.on('will-navigate', guard)
    wc.on('will-redirect', guard)
    // 新しいウィンドウは開かない（新しいタブで開くのは T2-2c）
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.views.set(tabId, view)
    return view
  }
}
