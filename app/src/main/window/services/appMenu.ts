import type { MenuItemConstructorOptions } from 'electron'

// メニューで受けるショートカット。フォーカスがページ（WebContentsView）にあっても効くように、
// キー入力は画面ではなくメニューの accelerator で受ける
// 1〜9 の番号つきの操作（タブを選ぶ・Workspace を切り替える。F01・F02）
type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type MenuCommand =
  | `tab-select-${Digit}`
  | `workspace-switch-${Digit}`
  | 'tab-new'
  | 'tab-close'
  | 'tab-reopen'
  | 'page-reload'
  | 'page-devtools'
  | 'focus-address-bar'
  | 'focus-search'
  | 'toggle-side-panel'
  | 'bookmark-page'

type Labels = Record<
  | Exclude<MenuCommand, `${'tab-select' | 'workspace-switch'}-${number}`>
  | 'tab-menu'
  | 'view-menu'
  | 'close-window'
  | 'workspace-menu'
  | 'tab-select-n'
  | 'tab-select-last'
  | 'workspace-switch-n',
  string
>

const DIGITS: Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

// Workspace を切り替えるキーの修飾キー（設定 workspaceSwitchModifier。F01）。
// auto は macOS で Ctrl、Windows・Linux で Alt（タブの切り替えの Cmd/Ctrl+数字とぶつからない）
export function resolveWorkspaceModifier(
  setting: 'auto' | 'ctrl' | 'alt',
  platform: NodeJS.Platform
): 'ctrl' | 'alt' {
  return setting === 'auto' ? (platform === 'darwin' ? 'ctrl' : 'alt') : setting
}

// アプリのメニューの定義（F02・F10）。コピー・貼り付け・終了などは Electron の標準の役割（role）に任せる。
// 標準のメニューのうち、次のものは使わない（ぶつかるため、中身を自分で書く）:
// - Cmd/Ctrl+W（ウィンドウを閉じる）→ タブを閉じる。ウィンドウを閉じるのは Cmd/Ctrl+Shift+W
// - Cmd/Ctrl+R（UI の再読み込み）→ ページの再読み込み
// - 拡大・縮小（UI の倍率が変わると、ページの表示位置がずれる。ipc-spec の view:setBounds）。
//   ページの拡大・縮小は後のタスクで、ページに対する項目として足す
// - 開発者ツール（UI に開く）→ 表示中のページに開く
export function appMenuTemplate(
  platform: NodeJS.Platform,
  labels: Labels,
  run: (command: MenuCommand) => void,
  workspaceSetting: 'auto' | 'ctrl' | 'alt'
): MenuItemConstructorOptions[] {
  const workspaceModifier = resolveWorkspaceModifier(workspaceSetting, platform)
  // Windows・Linux で Workspace に Ctrl を選ぶと、Ctrl+数字は Workspace が使う（タブの切り替えは外す。ぶつかるため）
  const tabSelectKeys = platform === 'darwin' || workspaceModifier !== 'ctrl'
  const numbered = (
    ids: (n: Digit) => MenuCommand,
    label: (n: Digit) => string,
    accelerator: (n: Digit) => string
  ): MenuItemConstructorOptions[] =>
    DIGITS.map((n) => ({
      id: ids(n),
      label: label(n),
      accelerator: accelerator(n),
      click: () => run(ids(n))
    }))
  const item = (id: MenuCommand, accelerator: string): MenuItemConstructorOptions => ({
    id,
    label: labels[id],
    accelerator,
    click: () => run(id)
  })
  const tabMenu: MenuItemConstructorOptions = {
    label: labels['tab-menu'],
    submenu: [
      item('tab-new', 'CmdOrCtrl+T'),
      item('tab-close', 'CmdOrCtrl+W'),
      item('tab-reopen', 'CmdOrCtrl+Shift+T'),
      // 今のページをブックマークに足す（F08）
      item('bookmark-page', 'CmdOrCtrl+D'),
      { type: 'separator' },
      item('focus-address-bar', 'CmdOrCtrl+L'),
      // 統合検索欄（F10）。隠した項目のキーは Windows・Linux で効かないので、見える項目にする
      item('focus-search', 'CmdOrCtrl+K'),
      // Chrome と同じ Cmd/Ctrl+1〜8 は左から数えたタブ、9 は最後のタブ（F02）
      ...(tabSelectKeys
        ? [
            {
              label: labels['tab-select-n'].replace('{{n}}', ''),
              submenu: numbered(
                (n) => `tab-select-${n}`,
                (n) =>
                  n === 9
                    ? labels['tab-select-last']
                    : labels['tab-select-n'].replace('{{n}}', String(n)),
                (n) => `CmdOrCtrl+${n}`
              )
            } satisfies MenuItemConstructorOptions
          ]
        : [])
    ]
  }
  // 左パネルの並び順で、1〜9 番目の Workspace へ切り替える（F01）
  const workspaceMenu: MenuItemConstructorOptions = {
    label: labels['workspace-menu'],
    submenu: numbered(
      (n) => `workspace-switch-${n}`,
      (n) => labels['workspace-switch-n'].replace('{{n}}', String(n)),
      (n) => `${workspaceModifier === 'ctrl' ? 'Ctrl' : 'Alt'}+${n}`
    )
  }
  const mac = platform === 'darwin'
  return [
    ...(mac ? [{ role: 'appMenu' } as const] : []),
    {
      role: 'fileMenu',
      submenu: [
        { role: 'close', label: labels['close-window'], accelerator: 'CmdOrCtrl+Shift+W' },
        ...(mac ? [] : [{ role: 'quit' } as const])
      ]
    },
    { role: 'editMenu' },
    tabMenu,
    workspaceMenu,
    {
      label: labels['view-menu'],
      submenu: [
        item('page-reload', 'CmdOrCtrl+R'),
        // 左パネルの2段目を畳む・開く（F15）
        item('toggle-side-panel', 'CmdOrCtrl+B'),
        // 開発者ツールは、UI ではなく表示中のページに対して開く
        item('page-devtools', mac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I'),
        { role: 'togglefullscreen' }
      ]
    },
    {
      role: 'windowMenu',
      submenu: [{ role: 'minimize' }, ...(mac ? [{ role: 'zoom' } as const] : [])]
    }
  ]
}
