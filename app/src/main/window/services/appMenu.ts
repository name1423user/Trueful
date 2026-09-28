import type { MenuItemConstructorOptions } from 'electron'

// メニューで受けるショートカット。フォーカスがページ（WebContentsView）にあっても効くように、
// キー入力は画面ではなくメニューの accelerator で受ける
export type MenuCommand =
  | 'tab-new'
  | 'tab-close'
  | 'tab-reopen'
  | 'page-reload'
  | 'page-devtools'
  | 'focus-address-bar'
  | 'focus-search'

type Labels = Record<MenuCommand | 'tab-menu' | 'view-menu' | 'close-window', string>

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
  run: (command: MenuCommand) => void
): MenuItemConstructorOptions[] {
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
      { type: 'separator' },
      item('focus-address-bar', 'CmdOrCtrl+L'),
      // 統合検索欄（F10）。隠した項目のキーは Windows・Linux で効かないので、見える項目にする
      item('focus-search', 'CmdOrCtrl+K')
    ]
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
    {
      label: labels['view-menu'],
      submenu: [
        item('page-reload', 'CmdOrCtrl+R'),
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
