import { randomUUID } from 'node:crypto'

// 統合検索欄に打った文字列への「その場の答え」（F10）。選ぶと value をクリップボードにコピーする。
// 画面の見出しは kind から辞書で引く（ここには UI の文字列を置かない）
export type AnswerKind =
  | 'unix-to-date'
  | 'date-to-unix'
  | 'unix-now'
  | 'calc'
  | 'color'
  | 'base64-encode'
  | 'base64-decode'
  | 'url-encode'
  | 'url-decode'
  | 'uuid'
export type Answer = { kind: AnswerKind; value: string; detail?: string; color?: string }

const MAX_INPUT = 2000
const DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?)?(?:\s?(Z|[+-]\d{2}:?\d{2}))?$/i

// 日時の文字列を Unix 時刻（ミリ秒）にする。時差がなければ UTC。存在しない日付・日時は undefined
function parseDate(text: string): number | undefined {
  const m = DATE.exec(text)
  if (!m) return undefined
  const [y, mo, d, h, mi, s] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i] ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number
  ]
  // Date.UTC は 0〜99 年を 1900 年代にするので、年は setUTCFullYear で入れる
  const date = new Date(0)
  date.setUTCFullYear(y, mo - 1, d)
  date.setUTCHours(h, mi, s, 0)
  // 2023-02-30 のように繰り上がる日付や、25 時・61 分は、存在しない日時として断る
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59 || s > 59)
    return undefined
  const zone = m[7]
  if (!zone || zone.toUpperCase() === 'Z') return date.getTime()
  const digits = zone.slice(1).replace(':', '')
  const [zh, zm] = [Number(digits.slice(0, 2)), Number(digits.slice(2, 4))]
  if (zh > 23 || zm > 59) return undefined
  return date.getTime() - (zone.startsWith('-') ? -1 : 1) * (zh * 60 + zm) * 60_000
}

// 四則演算（+ - * / % ^ とかっこ、単項のマイナス）。eval は使わず、再帰下降で読む。
// 演算子が1つもなければ（数字だけ・かっこだけ）、答えない。壊れた式・0 で割る・深すぎるものも答えない
function calc(text: string): string | undefined {
  if (!/^[\d\s+\-*/%^().]+$/.test(text) || !/[+\-*/%^]/.test(text)) return undefined
  // 数字を - でつないだだけのもの（電話番号・日付）、2024/01/01 や 12/31 のような日付らしいものは、
  // 計算のつもりではないことが多い。空白を入れれば計算する（12 / 31）
  if (/^-?\d+(?:-\d+)+$|^\d+\/\d+\/\d+$|^\d{1,2}\/\d{1,2}$/.test(text)) return undefined
  const tokens = text.match(/\d+(?:\.\d+)?|[+\-*/%^()]/g) ?? []
  if (tokens.join('').length !== text.replace(/\s/g, '').length) return undefined // 数字として読めない（192.168.0.1 など）
  let pos = 0
  let depth = 0
  let sawOperator = false
  const fail = (): never => {
    throw new Error('calc')
  }
  const primary = (): number => {
    const t = tokens[pos++]
    if (t === undefined) return fail()
    if (t === '(') {
      if (++depth > 50) fail()
      const v = add()
      if (tokens[pos++] !== ')') fail()
      depth--
      return v
    }
    if (t === '-') {
      if (++depth > 50) fail()
      const v = -power()
      depth--
      return v
    }
    return /^\d/.test(t) ? Number(t) : fail()
  }
  const power = (): number => {
    const base = primary()
    if (tokens[pos] !== '^') return base
    pos++
    sawOperator = true
    if (++depth > 50) fail()
    const exp = power() // 右から
    depth--
    return base ** exp
  }
  const mul = (): number => {
    let v = power()
    for (let t = tokens[pos]; t === '*' || t === '/' || t === '%'; t = tokens[pos]) {
      pos++
      sawOperator = true
      const r = power()
      v = t === '*' ? v * r : t === '/' ? v / r : v % r
    }
    return v
  }
  const add = (): number => {
    let v = mul()
    for (let t = tokens[pos]; t === '+' || t === '-'; t = tokens[pos]) {
      pos++
      sawOperator = true
      v = t === '+' ? v + mul() : v - mul()
    }
    return v
  }
  try {
    const v = add()
    if (pos !== tokens.length || !sawOperator || !Number.isFinite(v)) return undefined
    // 整数はそのまま（桁を落とさない）。小数は 15 桁に丸める（0.1 + 0.2 が 0.30000000000000004 にならないように）
    return Number.isInteger(v) ? String(v) : String(parseFloat(v.toPrecision(15)))
  } catch {
    return undefined
  }
}

const hex2 = (n: number): string => n.toString(16).padStart(2, '0')

function color(text: string): Answer | undefined {
  let rgb: number[] | undefined
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)?.[1]
  if (h) {
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
    rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  } else {
    const m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(text)
    if (m) rgb = m.slice(1, 4).map(Number)
  }
  if (!rgb || rgb.some((n) => n > 255)) return undefined
  const hex = `#${rgb.map(hex2).join('')}`
  return { kind: 'color', value: hex, detail: `rgb(${rgb.join(', ')})`, color: hex }
}

function base64Decode(text: string): string | undefined {
  const t = text.replace(/={1,2}$/, '')
  if (!/^[A-Za-z0-9+/_-]*$/.test(t) || t.length % 4 === 1) return undefined
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(t, 'base64'))
    // eslint-disable-next-line no-control-regex -- 制御文字（\t \n \r 以外）を含むものは、文字列ではなく2進数
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(decoded) ? undefined : decoded
  } catch {
    return undefined // UTF-8 ではない
  }
}

// 1文字ごとに呼ばれるので、どんな入力でも例外を出さない（対になっていないサロゲートで encodeURIComponent が投げる、など）
export function answers(query: string, ctx: { now?: number; uuid?: () => string } = {}): Answer[] {
  try {
    return compute(query, ctx)
  } catch {
    return []
  }
}

function compute(query: string, ctx: { now?: number; uuid?: () => string }): Answer[] {
  const text = query.trim()
  if (text === '' || text.length > MAX_INPUT) return []
  const now = ctx.now ?? Date.now()

  if (/^\d{10}$/.test(text) || /^\d{13}$/.test(text)) {
    const ms = text.length === 10 ? Number(text) * 1000 : Number(text)
    return [{ kind: 'unix-to-date', value: new Date(ms).toISOString() }]
  }
  if (text.toLowerCase() === 'now')
    return [{ kind: 'unix-now', value: String(Math.floor(now / 1000)) }]
  if (DATE.test(text)) {
    const ms = parseDate(text)
    return ms === undefined ? [] : [{ kind: 'date-to-unix', value: String(Math.floor(ms / 1000)) }]
  }
  if (text.toLowerCase() === 'uuid') return [{ kind: 'uuid', value: (ctx.uuid ?? randomUUID)() }]

  const c = color(text)
  if (c) return [c]
  const keyword = /^(base64d|b64d|base64|b64|urlencode|urle|urldecode|urld)\s+(.+)$/is.exec(text)
  if (keyword) {
    const [, word, arg] = keyword as unknown as [string, string, string]
    switch (word.toLowerCase()) {
      case 'base64':
      case 'b64':
        return [{ kind: 'base64-encode', value: Buffer.from(arg, 'utf8').toString('base64') }]
      case 'base64d':
      case 'b64d': {
        const value = base64Decode(arg.trim())
        return value === undefined ? [] : [{ kind: 'base64-decode', value }]
      }
      case 'urlencode':
      case 'urle':
        return [{ kind: 'url-encode', value: encodeURIComponent(arg) }]
      default:
        try {
          return [{ kind: 'url-decode', value: decodeURIComponent(arg) }]
        } catch {
          return [] // 壊れた % の符号
        }
    }
  }
  const value = calc(text)
  return value === undefined ? [] : [{ kind: 'calc', value }]
}
