// 取り込むブックマークの木（Chrome の JSON・HTML のどちらも、この形にしてから DB に入れる）
export type ImportNode =
  | { kind: 'folder'; title: string; children: ImportNode[] }
  | { kind: 'url'; title: string; url: string }

// 取り込みの結果。failed は、URL が使えない（http・https 以外）・壊れているために取り込まなかった数
export type ParsedBookmarks = { nodes: ImportNode[]; failed: number }

// 取り込む URL は http・https だけ（javascript: や file: を、クリックで開けるブックマークにしない）
export function isBookmarkUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}
