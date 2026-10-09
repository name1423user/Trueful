import { isBookmarkUrl, MAX_DEPTH, type ImportNode, type ParsedBookmarks } from './bookmarkTree'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1]!.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

// Chrome が書き出す Netscape 形式の HTML（<DL> がフォルダの中身、<H3> がフォルダの名前、<A HREF> がブックマーク）を、
// ブックマークの木にする（F08）。使えない URL は failed に数える。<DL> が1つもなければ、ブックマークの HTML ではないので例外
export function parseHtmlBookmarks(html: string): ParsedBookmarks {
  const root: ImportNode[] = []
  const stack: ImportNode[][] = []
  let pending: ImportNode[] | undefined // <H3> の直後の <DL> が、このフォルダの中身になる
  let failed = 0
  let sawList = false
  for (const m of html.matchAll(
    /<(\/?)(DL|H3|A)\b((?:"[^"]*"|'[^']*'|[^<>"']){0,4096})>([^<]*)/gi
  )) {
    const [, close, tag, attrs, text] = m as unknown as [string, string, string, string, string]
    const name = tag.toUpperCase()
    if (name === 'DL') {
      if (close) {
        stack.pop() // 余分な </DL> は、何も積んでいなければ無視する
      } else {
        sawList = true
        if (stack.length >= MAX_DEPTH) throw new Error('入れ子が深すぎる')
        stack.push(pending ?? stack[stack.length - 1] ?? root)
        pending = undefined
      }
    } else if (close) {
      continue
    } else if (name === 'H3') {
      const children: ImportNode[] = []
      ;(stack[stack.length - 1] ?? root).push({
        kind: 'folder',
        title: decode(text.trim()),
        children
      })
      pending = children
    } else {
      pending = undefined // <H3> の直後の <DL> だけが、そのフォルダの中身
      const href = /\bHREF\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs)
      const raw = href?.[1] ?? href?.[2]
      if (raw === undefined) continue // HREF のない <A>（名前だけのアンカー）は数えない
      const url = decode(raw).trim()
      if (isBookmarkUrl(url)) {
        ;(stack[stack.length - 1] ?? root).push({ kind: 'url', title: decode(text.trim()), url })
      } else {
        failed++
      }
    }
  }
  if (!sawList) throw new Error('ブックマークの HTML ではない')
  return { nodes: prune(root), failed }
}

// 空のフォルダは取り込まない（Chrome の JSON と同じ）
function prune(nodes: ImportNode[]): ImportNode[] {
  return nodes.flatMap((n): ImportNode[] => {
    if (n.kind === 'url') return [n]
    const children = prune(n.children)
    return children.length > 0 ? [{ ...n, children }] : []
  })
}
