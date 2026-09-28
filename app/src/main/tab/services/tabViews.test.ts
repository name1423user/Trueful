import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ WebContentsView: class {} }))
const { reservedShortcut } = await import('./tabViews')

const key = (
  k: string,
  mods: Partial<{ control: boolean; meta: boolean; shift: boolean; alt: boolean }> = {}
): Parameters<typeof reservedShortcut>[0] => ({
  type: 'keyDown',
  key: k,
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
})
