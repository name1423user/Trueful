import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ WebContentsView: class {} }))
const { reservedShortcut } = await import('./tabViews')

const key = (
  k: string,
  mods: Partial<{ control: boolean; meta: boolean; shift: boolean; alt: boolean }> = {}
): Parameters<typeof reservedShortcut>[0] => ({
  type: 'keyDown',
  key: k,
  // 数字は、Alt を押すと key が別の文字になる（macOS の Alt+1 は「¡」）ので、code で見る
  code: /^\d$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`,
  control: false,
  meta: false,
  shift: false,
  alt: false,
  ...mods
})

describe('ページに奪わせないショートカット', () => {
  it('macOS は Cmd、Windows・Linux は Ctrl で T・W・Shift+T', () => {
    expect(reservedShortcut(key('t', { meta: true }), 'darwin')).toBe('tab-new')
    expect(reservedShortcut(key('W', { meta: true }), 'darwin')).toBe('tab-close')
    expect(reservedShortcut(key('T', { meta: true, shift: true }), 'darwin')).toBe('tab-reopen')
    expect(reservedShortcut(key('t', { control: true }), 'win32')).toBe('tab-new')
    expect(reservedShortcut(key('w', { control: true }), 'linux')).toBe('tab-close')
  })

  it('ほかのキーや修飾キーの組み合わせ、keyUp は奪わない', () => {
    expect(reservedShortcut(key('t', { control: true }), 'darwin')).toBeUndefined()
    expect(reservedShortcut(key('t', { meta: true }), 'win32')).toBeUndefined()
    expect(reservedShortcut(key('k', { meta: true }), 'darwin')).toBeUndefined()
    expect(reservedShortcut(key('t', { meta: true, alt: true }), 'darwin')).toBeUndefined()
    expect(reservedShortcut(key('w', { meta: true, shift: true }), 'darwin')).toBeUndefined()
    expect(
      reservedShortcut({ ...key('t', { meta: true }), type: 'keyUp' }, 'darwin')
    ).toBeUndefined()
  })

  describe('数字のキー（Workspace・タブの切り替え）', () => {
    it('Workspace: macOS は Ctrl+数字、Windows・Linux は Alt+数字（auto）。Alt のとき macOS の key が別の文字でも code で見る', () => {
      expect(reservedShortcut(key('2', { control: true }), 'darwin', 'ctrl')).toBe(
        'workspace-switch-2'
      )
      expect(reservedShortcut(key('3', { alt: true }), 'win32', 'alt')).toBe('workspace-switch-3')
      expect(reservedShortcut({ ...key('4', { alt: true }), key: '¢' }, 'darwin', 'alt')).toBe(
        'workspace-switch-4'
      )
    })
    it('タブ: macOS は Cmd+数字、Windows・Linux は Ctrl+数字', () => {
      expect(reservedShortcut(key('1', { meta: true }), 'darwin', 'ctrl')).toBe('tab-select-1')
      expect(reservedShortcut(key('9', { control: true }), 'win32', 'alt')).toBe('tab-select-9')
    })
    it('Windows・Linux で Workspace に Ctrl を選んだら、Ctrl+数字は Workspace（タブの切り替えは外す）', () => {
      expect(reservedShortcut(key('5', { control: true }), 'linux', 'ctrl')).toBe(
        'workspace-switch-5'
      )
    })
    it('0・Shift つき・余分な修飾キー・数字でないキーは奪わない', () => {
      expect(reservedShortcut(key('0', { meta: true }), 'darwin', 'ctrl')).toBeUndefined()
      expect(
        reservedShortcut(key('1', { meta: true, shift: true }), 'darwin', 'ctrl')
      ).toBeUndefined()
      expect(
        reservedShortcut(key('1', { control: true, alt: true }), 'win32', 'alt')
      ).toBeUndefined()
      expect(reservedShortcut(key('1'), 'win32', 'alt')).toBeUndefined()
    })
  })
})
