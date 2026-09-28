import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import ja from '../../../renderer/src/locales/ja.json'
import { appMenuTemplate, type MenuCommand } from './appMenu'

// メニューの全項目を平らにする
function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((i) => [
    i,
    ...(Array.isArray(i.submenu) ? flatten(i.submenu as MenuItemConstructorOptions[]) : [])
  ])
}

describe('アプリのメニュー', () => {
  it.each(['darwin', 'win32', 'linux'] as const)(
    'ショートカットはタブの操作に割り当て、ぶつかる標準の項目を置かない: %s',
    (platform) => {
      const run = vi.fn()
      const items = flatten(appMenuTemplate(platform, ja.menu, run))
      const byAccelerator = new Map<string, MenuItemConstructorOptions[]>()
      for (const i of items) {
        if (!i.accelerator) continue
        byAccelerator.set(i.accelerator, [...(byAccelerator.get(i.accelerator) ?? []), i])
      }
      // 同じキーが2つの項目に割り当てられていない
      for (const [key, list] of byAccelerator) expect(list, key).toHaveLength(1)
      const commands: [string, MenuCommand][] = [
        ['CmdOrCtrl+T', 'tab-new'],
        ['CmdOrCtrl+W', 'tab-close'],
        ['CmdOrCtrl+Shift+T', 'tab-reopen'],
        ['CmdOrCtrl+R', 'page-reload'],
        ['CmdOrCtrl+L', 'focus-address-bar'],
        ['CmdOrCtrl+K', 'focus-search'],
        ['CmdOrCtrl+B', 'toggle-side-panel'],
        [platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', 'page-devtools']
      ]
      for (const [key, command] of commands) {
        const [item] = byAccelerator.get(key)!
        ;(item!.click as () => void)()
        expect(run).toHaveBeenLastCalledWith(command)
      }
      // UI の再読み込み・拡大縮小・開発者ツールの標準の項目は置かない
      const roles = items.map((i) => i.role).filter(Boolean)
      for (const role of [
        'reload',
        'forceReload',
        'zoomIn',
        'zoomOut',
        'resetZoom',
        'toggleDevTools'
      ]) {
        expect(roles).not.toContain(role)
      }
      // 隠した項目のキーは Windows・Linux で効かないので、キーのある項目は見えるようにする
      for (const i of items) if (i.accelerator) expect(i.visible, i.accelerator).not.toBe(false)
      // 標準の役割を使わない項目のラベルは辞書から
      for (const i of items) if (!i.role && i.type !== 'separator') expect(i.label).toBeTruthy()
    }
  )
})
