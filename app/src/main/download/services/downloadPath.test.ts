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
})

describe('名前の長さと危険な文字（ファイルシステムの制限）', () => {
  const bytes = (s: string): number => Buffer.byteLength(s, 'utf8')

  it('フォルダ名もファイル名も、UTF-8 で 200 バイト以下（連番の分の余裕を残して、255 バイトの制限に収める）', () => {
    for (const long of ['あ'.repeat(150), '😀'.repeat(150), 'a'.repeat(400)]) {
      expect(bytes(sanitizeFolderName(long))).toBeLessThanOrEqual(200)
      expect(bytes(sanitizeFileName(`${long}.pdf`))).toBeLessThanOrEqual(200)
    }
  })

  it('長いファイル名でも、拡張子は残す（語幹だけを切る）', () => {
    const name = sanitizeFileName(`${'あ'.repeat(150)}.pdf`)
    expect(name.endsWith('.pdf')).toBe(true)
    expect(sanitizeFileName(`${'a'.repeat(300)}.tar.gz`).endsWith('.tar.gz')).toBe(true)
  })

  it('予約名は、空白やドットの前後があっても見逃さない（「CON .txt」「nul.」）', () => {
    expect(sanitizeFolderName('CON .txt')).toBe('_CON .txt')
    expect(sanitizeFileName('nul.tar.gz')).toBe('_nul.tar.gz')
  })

  it('C1 制御文字と、向きを変える文字（拡張子の偽装に使われる U+202E など）は _ にする', () => {
    expect(sanitizeFileName('a\u007fb\u0085c\u202ed\u2066e')).toBe('a_b_c_d_e')
  })

  it('NFC に正規化する（濁点が分かれた「が」も 1 文字にそろえる）。ファイル名の先頭の空白は除く。フォルダの先頭のドットは _', () => {
    expect(sanitizeFolderName('か\u3099')).toBe('が')
    expect(sanitizeFileName('  a.txt')).toBe('a.txt')
    expect(sanitizeFolderName('.git')).toBe('_git')
  })

  it('パスの区切りだけの名前や、..\\..\\x は、フォルダの外に出ない', () => {
    expect(sanitizeFileName('/')).toBe('download')
    expect(sanitizeFileName('..\\..\\x')).toBe('x')
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

  it('先頭がドットの名前（.bashrc）は、拡張子のない名前として扱う。exists がいつも true でも止まる', () => {
    expect(uniquePath('/d', '.bashrc', (p) => p === '/d/.bashrc', '/')).toBe('/d/.bashrc (1)')
    const result = uniquePath('/d', 'a.txt', () => true, '/')
    expect(result).toMatch(/^\/d\/a \(.+\)\.txt$/)
  })

  it('連番は途中が空いていても、いちばん小さい空きを使う', () => {
    const existing = new Set(['/d/a.txt', '/d/a (2).txt'])
    expect(uniquePath('/d', 'a.txt', (p) => existing.has(p), '/')).toBe('/d/a (1).txt')
  })
})
