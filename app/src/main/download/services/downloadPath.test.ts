import { describe, expect, it } from 'vitest'
import { downloadDir, sanitizeFileName, sanitizeFolderName, uniquePath } from './downloadPath'

describe('Workspace 名のフォルダ名（F07）', () => {
  it('使えない文字 / \\ : * ? " < > | を _ に置き換える', () => {
    expect(sanitizeFolderName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
    expect(sanitizeFolderName('案件A')).toBe('案件A')
  })

  it('制御文字も置き換える。末尾の空白・ドット（Windows で使えない）を除く。空・. ・.. は _', () => {
    expect(sanitizeFolderName('a\u0000b\u001fc')).toBe('a_b_c')
    expect(sanitizeFolderName('name. . ')).toBe('name')
    expect(sanitizeFolderName('')).toBe('_')
    expect(sanitizeFolderName('   ')).toBe('_')
    expect(sanitizeFolderName('.')).toBe('_')
    expect(sanitizeFolderName('..')).toBe('_')
  })

  it('Windows の予約名（CON・NUL・COM1 など。拡張子つきも）は先頭に _ を付ける', () => {
    for (const name of ['CON', 'nul', 'COM1', 'lpt9', 'con.txt']) {
      expect(sanitizeFolderName(name)).toBe(`_${name}`)
    }
    expect(sanitizeFolderName('console')).toBe('console')
  })

  it('長すぎる名前は 100 文字（絵文字も 1 文字と数える）で切る', () => {
    expect([...sanitizeFolderName('あ'.repeat(150))]).toHaveLength(100)
    expect([...sanitizeFolderName('😀'.repeat(150))]).toHaveLength(100)
  })
})

describe('保存先（F07）', () => {
  it('<Downloads>/Trueful/<Workspace 名>/ に保存する', () => {
    expect(downloadDir('/home/me/Downloads', 'a/b').replaceAll('\\', '/')).toBe(
      '/home/me/Downloads/Trueful/a_b'
    )
  })
})

describe('ファイル名', () => {
  it('サーバーが示したファイル名からも、パスの区切りなどを取り除く（フォルダの外に書かせない）', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFileName('C:\\Windows\\evil.exe')).toBe('evil.exe')
    expect(sanitizeFileName('a?b.txt')).toBe('a_b.txt')
    expect(sanitizeFileName('')).toBe('download')
    expect(sanitizeFileName('..')).toBe('download')
  })

  it('同名のファイルがあれば ` (1)`、` (2)` と連番を付ける。拡張子の前に付ける', () => {
    const existing = new Set(['/d/a.txt', '/d/a (1).txt', '/d/noext', '/d/x.tar.gz'])
    const exists = (p: string): boolean => existing.has(p)
    expect(uniquePath('/d', 'b.txt', exists, '/')).toBe('/d/b.txt')
    expect(uniquePath('/d', 'a.txt', exists, '/')).toBe('/d/a (2).txt')
    expect(uniquePath('/d', 'noext', exists, '/')).toBe('/d/noext (1)')
    expect(uniquePath('/d', 'x.tar.gz', exists, '/')).toBe('/d/x (1).tar.gz')
  })

  it('連番は途中が空いていても、いちばん小さい空きを使う', () => {
    const existing = new Set(['/d/a.txt', '/d/a (2).txt'])
    expect(uniquePath('/d', 'a.txt', (p) => existing.has(p), '/')).toBe('/d/a (1).txt')
  })
})
