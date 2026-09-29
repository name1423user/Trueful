import { WebContentsView, type BaseWindow, type Rectangle, type WebContents } from 'electron'
import { isAllowedPageUrl } from './urlInput'
import { pageUserAgent } from './userAgent'
import { MAX_PAGE_VIEWS, viewsToDiscard } from './viewLimit'

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
  // 上限（F02）を超えたので、これらのタブのページを破棄した（URL とタイトルは DB に残っている）
  onDiscarded: (tabIds: number[]) => void
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

// スクロール位置の読み書きは、ページのスクリプトとは別の世界（isolated world）で行う
// （ページが scrollY などを書き換えていても、その影響を受けない）
const TRUEFUL_WORLD = 1000
// 休止の前にスクロール位置を読むのを待つ上限（固まったページで休止を止めない）
const SCROLL_READ_MS = 500

// タブのページを WebContentsView で表示する（ADR-008）。表示するのは1つだけで、ほかは外しておく。
// Workspace ごとのパーティション persist:workspace-<id> を使う（ログインを Workspace で分ける。F03）。
// 実体は全 Workspace で最大 maxViews 個。超えたら、いちばん長く表示していないページを破棄する（F02）
export class TabViews {
  private readonly views = new Map<number, WebContentsView>()
  private shown: number | undefined
  private bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
  // 最後に見ていた順の番号（表示し始めたときと、ほかのタブに切り替えて外したときに振る）。
  // 上限を超えたときに、いちばん長く見ていないものから破棄する
  private readonly lastShown = new Map<number, number>()
  private showCount = 0
  // 上限のために破棄したタブ（もう一度表示すると作り直す。画面では薄く出す）
  private readonly discarded = new Set<number>()
  // 権限のハンドラと User-Agent を設定したパーティション（1つのセッションに1回だけ設定する）
  private readonly guarded = new Set<string>()

  constructor(
    private window: BaseWindow,
    private readonly handlers: Handlers,
    private readonly maxViews = MAX_PAGE_VIEWS
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

  // そのタブのページを表示する（なければ作って url を読み込み、scrollY があれば読み込んだ後に戻す）。
  // ページを作ったら true
  show(tab: { id: number; workspaceId: number; url: string; scrollY?: number }): boolean {
    if (this.window.isDestroyed()) return false
    let view = this.views.get(tab.id)
    const created = !view
    if (!view) {
      view = this.create(tab.id, tab.workspaceId)
      this.discarded.delete(tab.id)
      // DB の URL も、読み込む前に確かめる（多層防御）
      const url = isAllowedPageUrl(tab.url) ? tab.url : 'about:blank'
      const scrollY = tab.scrollY ?? 0
      if (scrollY > 0) {
        const wc = view.webContents
        // 最初の読み込み1回だけ。失敗したら戻さない（あとの別ページに古い位置を当てない）
        const onFail = (): void => {
          wc.removeListener('did-finish-load', onLoad)
        }
        const onLoad = (): void => {
          wc.removeListener('did-fail-load', onFail)
          if (wc.isDestroyed()) return
          wc.executeJavaScriptInIsolatedWorld(TRUEFUL_WORLD, [
            { code: `window.scrollTo(0, ${Math.floor(scrollY)})` }
          ]).catch(() => {})
        }
        wc.once('did-finish-load', onLoad)
        wc.once('did-fail-load', onFail)
      }
      void view.webContents.loadURL(url).catch(() => {})
    }
    if (this.shown !== undefined && this.shown !== tab.id) {
      const previous = this.views.get(this.shown)
      if (previous) this.window.contentView.removeChildView(previous)
      // 直前まで見ていたタブは「いま見終わった」ので、いちばん新しい番号にする
      this.lastShown.set(this.shown, ++this.showCount)
    }
    this.window.contentView.addChildView(view)
    view.setBounds(this.bounds)
    this.shown = tab.id
    this.lastShown.set(tab.id, ++this.showCount)
    if (created) this.enforceLimit(tab.id)
    return created
  }

  // ページのスクロール位置を読んでから、ページを破棄する（Workspace の休止。F01）。
  // 読んでいる間に状況が変わったら（stillRelease が false）、破棄せずに undefined を返す。
  // 読めなかったら undefined（ページがない、固まっている、読んだ値がおかしい）
  async release(tabId: number, stillRelease: () => boolean): Promise<number | undefined> {
    const wc = this.views.get(tabId)?.webContents
    if (!wc || wc.isDestroyed()) return undefined
    const read = wc
      .executeJavaScriptInIsolatedWorld(TRUEFUL_WORLD, [{ code: 'Math.round(window.scrollY)' }])
      .catch(() => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), SCROLL_READ_MS)
    })
    const y: unknown = await Promise.race([read, timeout])
    clearTimeout(timer)
    if (!stillRelease()) return undefined
    this.destroy(tabId)
    return Number.isSafeInteger(y) && (y as number) >= 0 ? (y as number) : undefined
  }

  // 上限を超えていたら、いちばん長く表示していないページから破棄する（表示中のものは残す）
  private enforceLimit(keepTabId: number): void {
    const ids = viewsToDiscard(
      [...this.views.keys()].map((tabId) => ({ tabId, lastShown: this.lastShown.get(tabId) ?? 0 })),
      this.maxViews,
      keepTabId
    )
    if (ids.length === 0) return
    for (const id of ids) {
      this.destroy(id)
      this.discarded.add(id)
    }
    this.handlers.onDiscarded(ids)
  }

  // 上限のために破棄したタブか
  isDiscarded(tabId: number): boolean {
    return this.discarded.has(tabId)
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
    // 破棄済み（ページがない）のタブを閉じたときも、記録は消す
    this.lastShown.delete(tabId)
    this.discarded.delete(tabId)
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
