import {
  WebContentsView,
  type BaseWindow,
  type DownloadItem,
  type Rectangle,
  type WebContents
} from 'electron'
import type { MenuCommand } from '../../window/services/appMenu'
import { isAllowedPageUrl } from './urlInput'
import { pageUserAgent } from './userAgent'
import { classifyLoadError, type LoadError } from './loadError'
import { MAX_PAGE_VIEWS, viewsToDiscard } from './viewLimit'

// ページの様子（Renderer のアドレスバーと戻る・進むのボタンに使う）
export type PageState = {
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  // 読み込みに失敗したとき（F16）。ページの実体は隠し、Renderer が同じ場所にエラー画面を出す
  error?: LoadError
}

type Handlers = {
  // ページの URL・タイトル・読み込み中が変わった。committed は、移動が確定した・タイトルが変わったとき
  // （読み込みの開始・終了の知らせでは、URL はまだ前のページのことがある）
  onPageChanged: (tabId: number, page: PageState, committed: boolean) => void
  // ページが新しいウィンドウで開こうとした（target=_blank・window.open）。http・https で、
  // 直前にユーザーの入力があったときだけ呼ぶ。background は Cmd/Ctrl+クリック・中クリック（選ばずに開く）
  onOpenRequest: (tabId: number, url: string, background: boolean) => void
  // 読み込みの失敗でページを隠したとき、フォーカスを UI に移す（隠したページにキー入力が届かないように）
  onLoadError: () => void
  // ページがダウンロードを始めた（F07。パーティションごとに1回、セッションに付ける）
  onDownload: (workspaceId: number, item: DownloadItem) => void
  // ページの権限の要求（カメラ・通知など。F16）。許可するなら true。確認と記憶は Main の進行役で行う
  onPermissionRequest: (
    workspaceId: number,
    url: string,
    permission: string,
    details: {
      mediaTypes?: string[]
      isMainFrame?: boolean
      topLevelUrl?: string
      // 要求したページのタブ（確認をそのタブに結びつける。見つからなければ undefined）
      tabId?: number
    }
  ) => Promise<boolean>
  // 権限の同期の確認（記憶した許可だけが true）
  onPermissionCheck: (
    workspaceId: number,
    url: string,
    permission: string,
    details: { mediaTypes?: string[] }
  ) => boolean
  // ページにフォーカスがあるときに押された、ページに奪わせないショートカット（Chrome と同じ予約キー）
  onReservedShortcut: (command: ReservedShortcut) => void
  // Workspace の切り替えの修飾キー（設定 workspaceSwitchModifier を、今のプラットフォームで解決したもの）
  workspaceModifier: () => 'ctrl' | 'alt'
  // 上限（F02）を超えたので、これらのタブのページを破棄した（URL とタイトルは DB に残っている）
  onDiscarded: (tabIds: number[]) => void
  // タブのページを破棄した（閉じた・上限・休止・ウィンドウを閉じた）。そのページの権限の確認を終えるため
  onPageGone: (tabId: number) => void
}

// メニューの操作のうち、ページに奪わせないもの（番号つきは 1〜9）
export type ReservedShortcut = Extract<
  MenuCommand,
  'tab-new' | 'tab-close' | 'tab-reopen' | `tab-select-${number}` | `workspace-switch-${number}`
>

// ページに奪わせないキー（ページが keydown を止めても、Trueful の操作にする）。
// 数字のキーは、Workspace の切り替え（workspaceModifier の Ctrl か Alt + 1〜9。F01）と、
// タブの選択（macOS は Cmd、Windows・Linux は Ctrl + 1〜9。F02）。Windows・Linux で Workspace に Ctrl を
// 選んだら、Ctrl+数字は Workspace が使う（appMenu と同じ。ぶつからない）
export function reservedShortcut(
  input: Pick<Electron.Input, 'type' | 'key' | 'code' | 'control' | 'meta' | 'shift' | 'alt'>,
  platform: NodeJS.Platform,
  workspaceModifier: 'ctrl' | 'alt' = platform === 'darwin' ? 'ctrl' : 'alt'
): ReservedShortcut | undefined {
  if (input.type !== 'keyDown') return undefined
  // 数字は code で見る（macOS で Alt を押すと、key は 1 ではなく「¡」になる）
  const digit = /^Digit([1-9])$/.exec(input.code)?.[1]
  if (digit) {
    if (input.shift) return undefined
    const workspace =
      workspaceModifier === 'ctrl'
        ? input.control && !input.meta && !input.alt
        : input.alt && !input.control && !input.meta
    if (workspace) return `workspace-switch-${digit}` as ReservedShortcut
    const tab = platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta
    if (tab && !input.alt) return `tab-select-${digit}` as ReservedShortcut
    return undefined
  }
  const mod = platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta
  if (!mod || input.alt) return undefined
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
  // 読み込みに失敗しているタブ（メインフレーム。次に移動が確定するまで）
  private readonly errors = new Map<number, LoadError>()
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
    this.applyVisibility(tab.id)
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

  // ページを見せるか（読み込みに失敗しているタブは隠す。見せる・隠すは、ここ1か所で決める）
  private applyVisibility(tabId: number): void {
    this.views.get(tabId)?.setVisible(!this.errors.has(tabId))
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
    this.errors.delete(tabId)
    const view = this.views.get(tabId)
    if (!view) return
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
    this.views.delete(tabId)
    if (this.shown === tabId) this.shown = undefined
    this.handlers.onPageGone(tabId)
  }

  private tabIdOf(wc: WebContents): number | undefined {
    for (const [tabId, view] of this.views) if (view.webContents === wc) return tabId
    return undefined
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
    // ページのカメラ・通知などの権限（F16。パーティションごとに1回）
    const partition = `persist:workspace-${workspaceId}`
    if (!this.guarded.has(partition)) {
      // 権限は、Workspace とサイトごとに記憶した答えで決める（決めていなければ確認を出す。確認できないときは拒否）
      wc.session.setPermissionRequestHandler((requester, permission, callback, details) => {
        const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes
        // メインフレームの要求は、今のページの URL とも照らす（古い URL の要求を通さない）
        void this.handlers
          .onPermissionRequest(workspaceId, details.requestingUrl, permission, {
            mediaTypes,
            isMainFrame: details.isMainFrame,
            topLevelUrl: details.isMainFrame ? requester.getURL() : undefined,
            tabId: this.tabIdOf(requester)
          })
          .then(callback, () => callback(false))
      })
      wc.session.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
        const mediaType = (details as { mediaType?: string }).mediaType
        return this.handlers.onPermissionCheck(workspaceId, requestingOrigin, permission, {
          mediaTypes: mediaType === 'video' || mediaType === 'audio' ? [mediaType] : undefined
        })
      })
      // Service Worker などの要求にも効くように、セッションにも設定する（作り済みのページには効かない）
      wc.session.setUserAgent(pageUserAgent(wc.session.getUserAgent()))
      wc.session.on('will-download', (_event, item) => this.handlers.onDownload(workspaceId, item))
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
          // エラーページ自身の URL（chrome-error://）は、アドレスバーやタブに出さない（失敗した URL を出す）
          url: wc.getURL().startsWith('chrome-error://')
            ? (this.errors.get(tabId)?.url ?? '')
            : wc.getURL(),
          title: wc.getTitle(),
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
          loading: wc.isLoading(),
          error: this.errors.get(tabId)
        },
        committed
      )
    }
    // 読み込みの失敗（F16）。メインフレームだけ。取りやめ（ERR_ABORTED）は失敗ではない。
    // ページの実体は隠して、同じ場所に Renderer がエラー画面を出す（証明書エラーで先に進む道は作らない）
    wc.on('did-fail-load', (_e, code, description, validatedURL, isMainFrame) => {
      const kind = classifyLoadError(code)
      if (!isMainFrame || kind === 'ignore' || wc.isDestroyed()) return
      this.errors.set(tabId, { kind, url: validatedURL, description })
      this.applyVisibility(tabId)
      this.handlers.onLoadError()
      notify(false)()
    })
    // 証明書のエラーは、いつも拒否する（既定の動きを、決めごととして明示する）
    wc.on('certificate-error', (event, _url, _error, _certificate, callback) => {
      event.preventDefault()
      callback(false)
    })
    // 別のページへの移動が確定したら、エラーを外してページを出す（エラーページ自身の移動は数えない）
    const clearError = (url: string): void => {
      if (url.startsWith('chrome-error://') || !this.errors.delete(tabId)) return
      this.applyVisibility(tabId)
    }
    wc.on('did-navigate', (_e, url) => clearError(url))
    // 同じ文書の中の移動（ハッシュだけ）で、エラーから戻ったとき（メインフレームだけ）
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) clearError(url)
    })
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
      const command = reservedShortcut(input, process.platform, this.handlers.workspaceModifier())
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
