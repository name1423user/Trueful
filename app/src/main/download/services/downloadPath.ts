import { randomUUID } from 'node:crypto'
import { join, sep } from 'node:path'

// ダウンロードの保存先（F07）: <Downloads>/Trueful/<Workspace 名>/。
// Workspace 名や、サーバーが示したファイル名は、フォルダの外へ出られない・OS で使えない名前にしてから使う

// 名前の長さの上限（UTF-8 のバイト数）。ext4 などの 255 バイトの制限に、連番（" (12)"）の分の余裕を残す
const MAX_NAME_BYTES = 200
// 拡張子として残す長さの上限
const MAX_EXT_LENGTH = 16
// 連番を試す上限。超えたらランダムな名前にする
const MAX_SEQUENCE = 1000
// Windows で使えない名前（最初のドットより前で見る。拡張子や、前後の空白がついていても使えない）
const RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i

// 使えない文字を _ に置き換える: / \ : * ? " < > |、制御文字（C0・DEL・C1）、
// 表示の向きを変える文字（U+202E などは、拡張子を偽装するのに使われる）
function replaceUnsafe(name: string): string {
  return name.normalize('NFC').replace(
    // eslint-disable-next-line no-control-regex
    /[/\\:*?"<>|\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g,
    '_'
  )
}

// UTF-8 で maxBytes 以下になるまで、コードポイント単位で後ろを切る
function truncateBytes(text: string, maxBytes: number): string {
  let bytes = 0
  let out = ''
  for (const ch of text) {
    const size = Buffer.byteLength(ch, 'utf8')
    if (bytes + size > maxBytes) break
    bytes += size
    out += ch
  }
  return out
}

const isReserved = (name: string): boolean => RESERVED.test(name.split('.')[0]!.trim())

// Workspace 名を、フォルダ名にする（先頭のドットは _。隠しフォルダにしない）
export function sanitizeFolderName(name: string): string {
  const cleaned = truncateBytes(replaceUnsafe(name).replace(/^\s+/, ''), MAX_NAME_BYTES).replace(
    /[. ]+$/,
    ''
  )
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return '_'
  const safe = cleaned.startsWith('.') ? `_${cleaned.slice(1)}` : cleaned
  return isReserved(safe) ? `_${safe}` : safe
}

// 拡張子（最後のドット以降。.tar.gz は二重で）と、その前の部分に分ける。先頭のドットだけの名前（.bashrc）は拡張子なし
function splitExtension(name: string): [string, string] {
  const compound = /^(.+?)(\.tar\.[^.]+)$/i.exec(name)
  if (compound) return [compound[1]!, compound[2]!]
  const dot = name.lastIndexOf('.')
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
}

// サーバーが示したファイル名を、保存先のフォルダの中に置けるファイル名にする（パスの区切りより後ろだけを使う）。
// 長いときは、拡張子を残して、その前の部分だけを切る
export function sanitizeFileName(name: string): string {
  const base = replaceUnsafe(name.split(/[/\\]/).pop() ?? '').replace(/^\s+/, '')
  const [stem, rawExt] = splitExtension(base)
  const ext = rawExt.length > MAX_EXT_LENGTH ? '' : rawExt
  const kept = ext === '' ? base : stem
  const cleaned =
    truncateBytes(kept, MAX_NAME_BYTES - Buffer.byteLength(ext, 'utf8')).replace(/[. ]+$/, '') + ext
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return 'download'
  return isReserved(cleaned) ? `_${cleaned}` : cleaned
}

export function downloadDir(downloadsDir: string, workspaceName: string): string {
  return join(downloadsDir, 'Trueful', sanitizeFolderName(workspaceName))
}

// 同名のファイルがあれば ` (1)`、` (2)` と連番を付ける（拡張子の前。いちばん小さい空きを使う）。
// 1000 まで試して空きがなければ、ランダムな名前にする。
// 確かめてから作るまでの間に、同時にもう1件が同じ名前を選ばないよう、
// 呼び出し側は、選んだパスを「予約済み」として exists に含める（T3-3b）
export function uniquePath(
  dir: string,
  fileName: string,
  exists: (path: string) => boolean,
  separator: string = sep
): string {
  const at = (name: string): string => `${dir}${separator}${name}`
  if (!exists(at(fileName))) return at(fileName)
  const [stem, ext] = splitExtension(fileName)
  for (let n = 1; n <= MAX_SEQUENCE; n++) {
    const candidate = at(`${stem} (${n})${ext}`)
    if (!exists(candidate)) return candidate
  }
  return at(`${stem} (${randomUUID()})${ext}`)
}
