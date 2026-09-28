import { WebContentsView, type BaseWindow, type Rectangle, type WebContents } from 'electron'
import { isAllowedPageUrl } from './urlInput'
import { pageUserAgent } from './userAgent'

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
  // ページが新しいウィンドウで開こうとした（target=_blank・window.open）。http・https で、
  // 直前にユーザーの入力があったときだけ呼ぶ。background は Cmd/Ctrl+クリック・中クリック（選ばずに開く）
  onOpenRequest: (tabId: number, url: string, background: boolean) => void
  // ページにフォーカスがあるときに押された、ページに奪わせないショートカット（Chrome と同じ予約キー）
  onReservedShortcut: (command: ReservedShortcut) => void
}

export type ReservedShortcut = 'tab-new' | 'tab-close' | 'tab-reopen'

// ページに奪わせないキー（ページが keydown を止めても、Trueful の操作にする）
export function reservedShortcut(
  input: Pick<Electron.Input, 'type' | 'key' | 'control' | 'meta' | 'shift' | 'alt'>,
  platform: NodeJS.Platform
): ReservedShortcut | undefined {
  const mod = platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta
  if (input.type !== 'keyDown' || !mod || input.alt) return undefined
  const key = input.key.toLowerCase()
  if (key === 't') return input.shift ? 'tab-reopen' : 'tab-new'
  if (key === 'w' && !input.shift) return 'tab-close'
  return undefined
}

// ユーザーの入力から、この時間の間だけ新しいタブを開ける（入力1回につき1つ）
const GESTURE_MS = 1000

// タブのページを WebContentsView で表示する（ADR-008）。表示するのは1つだけで、ほかは外しておく。
// Workspace ごとのパーティション persist:workspace-<id> を使う（ログインを Workspace で分ける。F03）。
// 実体の数の上限（30個）は T2-5 で扱う
export class TabViews {
  private readonly views = new Map<number, WebContentsView>()
  private shown: number | undefined
  private bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
  // 権限のハンドラと User-Agent を設定したパーティション（1つのセッションに1回だけ設定する）
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

  // 表示中のタブのページ（開発者ツールを開く対象）
  shownWebContents(): WebContents | undefined {
    return this.shown === undefined ? undefined : this.views.get(this.shown)?.webContents
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
      // Service Worker などの要求にも効くように、セッションにも設定する（作り済みのページには効かない）
      wc.session.setUserAgent(pageUserAgent(wc.session.getUserAgent()))
      this.guarded.add(partition)
    }
    // このページ自身にも設定する（セッションの設定の前に作ったページの保険。何度通しても同じ値になる）
    wc.setUserAgent(pageUserAgent(wc.getUserAgent()))
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
    // 新しいウィンドウは開かず、同じ Workspace の新しいタブで開く。Electron にはポップアップブロッカーが
    // ないので、直前のユーザーの入力（クリック・キー）1回につき1つだけ開く（タイマーでの連続を止める）
    let lastInput = 0
    wc.on('input-event', (_event, input) => {
      if (['mouseDown', 'keyDown', 'rawKeyDown', 'touchStart'].includes(input.type)) {
        lastInput = Date.now()
      }
    })
    wc.on('before-input-event', (event, input) => {
      const command = reservedShortcut(input, process.platform)
      if (!command) return
      event.preventDefault()
      this.handlers.onReservedShortcut(command)
    })
    wc.setWindowOpenHandler(({ url, disposition }) => {
      const byUser = Date.now() - lastInput < GESTURE_MS
      if (byUser && /^https?:/i.test(url) && isAllowedPageUrl(url)) {
        lastInput = 0
        this.handlers.onOpenRequest(tabId, url, disposition === 'background-tab')
      }
      return { action: 'deny' }
    })
    this.views.set(tabId, view)
    return view
  }
}
