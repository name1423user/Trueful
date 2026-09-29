import { join, sep } from 'node:path'

// ダウンロードの保存先（F07）: <Downloads>/Trueful/<Workspace 名>/。
// Workspace 名や、サーバーが示したファイル名は、フォルダの外へ出られない・OS で使えない名前にしてから使う

const MAX_NAME_LENGTH = 100
// Windows で使えない名前（拡張子がついていても使えない）
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

// 使えない文字（/ \ : * ? " < > | と制御文字）を _ に置き換える
function replaceUnsafe(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
}

// 名前が長すぎたら 100 文字（コードポイント）で切る。末尾の空白・ドット（Windows で使えない）は除く
function tidy(name: string): string {
  return [...name]
    .slice(0, MAX_NAME_LENGTH)
    .join('')
    .replace(/[. ]+$/, '')
}

// Workspace 名を、フォルダ名にする
export function sanitizeFolderName(name: string): string {
  const cleaned = tidy(replaceUnsafe(name)).replace(/^\s+/, '')
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return '_'
  return RESERVED.test(cleaned) ? `_${cleaned}` : cleaned
}

// サーバーが示したファイル名を、保存先のフォルダの中に置けるファイル名にする（パスの区切りより後ろだけを使う）
export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? ''
  const cleaned = tidy(replaceUnsafe(base))
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return 'download'
  return RESERVED.test(cleaned) ? `_${cleaned}` : cleaned
}

export function downloadDir(downloadsDir: string, workspaceName: string): string {
  return join(downloadsDir, 'Trueful', sanitizeFolderName(workspaceName))
}

// 同名のファイルがあれば ` (1)`、` (2)` と連番を付ける（拡張子の前。.tar.gz のような二重の拡張子は、まとめて後ろに残す）。
// 連番は、いちばん小さい空きを使う
export function uniquePath(
  dir: string,
  fileName: string,
  exists: (path: string) => boolean,
  separator: string = sep
): string {
  const at = (name: string): string => `${dir}${separator}${name}`
  if (!exists(at(fileName))) return at(fileName)
  const compound = /^(.+?)(\.tar\.[^.]+)$/i.exec(fileName)
  const dot = fileName.lastIndexOf('.')
  const [stem, ext] = compound
    ? [compound[1]!, compound[2]!]
    : dot > 0
      ? [fileName.slice(0, dot), fileName.slice(dot)]
      : [fileName, '']
  for (let n = 1; ; n++) {
    const candidate = at(`${stem} (${n})${ext}`)
    if (!exists(candidate)) return candidate
  }
}
