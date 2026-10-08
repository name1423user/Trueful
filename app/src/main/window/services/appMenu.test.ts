import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import ja from '../../../renderer/src/locales/ja.json'
import { appMenuTemplate, resolveWorkspaceModifier, type MenuCommand } from './appMenu'

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
      const items = flatten(appMenuTemplate(platform, ja.menu, run, 'auto'))
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

  describe('Workspace の切り替え（Ctrl/Alt+1〜9）とタブの切り替え（Cmd/Ctrl+1〜9）', () => {
    const combos = (['darwin', 'win32', 'linux'] as const).flatMap((platform) =>
      (['auto', 'ctrl', 'alt'] as const).map((modifier) => [platform, modifier] as const)
    )
    const accelerators = (
      platform: NodeJS.Platform,
      modifier: 'auto' | 'ctrl' | 'alt'
    ): Map<string, string> =>
      new Map(
        flatten(appMenuTemplate(platform, ja.menu, vi.fn(), modifier))
          .filter((i) => i.accelerator && /^[a-z]+-(select|switch)-\d$/.test(String(i.id)))
          .map((i) => [String(i.id), String(i.accelerator)] as const)
      )

    it('auto は、macOS で Ctrl、Windows・Linux で Alt', () => {
      expect(resolveWorkspaceModifier('auto', 'darwin')).toBe('ctrl')
      expect(resolveWorkspaceModifier('auto', 'win32')).toBe('alt')
      expect(resolveWorkspaceModifier('auto', 'linux')).toBe('alt')
      expect(resolveWorkspaceModifier('ctrl', 'win32')).toBe('ctrl')
      expect(resolveWorkspaceModifier('alt', 'darwin')).toBe('alt')
    })

    it.each(combos)('どの組み合わせでも、キーは重ならない: %s・%s', (platform, modifier) => {
      const map = accelerators(platform, modifier)
      expect(new Set(map.values()).size).toBe(map.size)
    })

    it.each([
      ['darwin', 'auto', 'Ctrl+1', 'CmdOrCtrl+1'],
      ['win32', 'auto', 'Alt+1', 'CmdOrCtrl+1'],
      ['linux', 'alt', 'Alt+9', 'CmdOrCtrl+9']
    ] as const)('既定の割り当て: %s・%s', (platform, modifier, workspaceKey, tabKey) => {
      const map = accelerators(platform, modifier)
      const n = workspaceKey.slice(-1)
      expect(map.get(`workspace-switch-${n}`)).toBe(workspaceKey)
      expect(map.get(`tab-select-${n}`)).toBe(tabKey)
      expect(map.size).toBe(18)
    })

    it('Windows・Linux で Workspace に Ctrl を選ぶと、Ctrl+1〜9 は Workspace が使い、タブの切り替えは外す（ぶつからない）', () => {
      const map = accelerators('win32', 'ctrl')
      expect(map.get('workspace-switch-3')).toBe('Ctrl+3')
      expect([...map.keys()].some((k) => k.startsWith('tab-select'))).toBe(false)
      expect(map.size).toBe(9)
    })

    it('項目を選ぶと、番号つきの操作を渡す', () => {
      const run = vi.fn()
      const items = flatten(appMenuTemplate('win32', ja.menu, run, 'auto'))
      for (const id of ['workspace-switch-2', 'tab-select-9']) {
        ;(items.find((i) => i.id === id)!.click as () => void)()
        expect(run).toHaveBeenLastCalledWith(id)
      }
    })
  })
})
