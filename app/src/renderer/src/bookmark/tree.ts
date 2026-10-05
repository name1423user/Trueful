// ブックマークの一覧（平らな配列）を、フォルダの入れ子の木にする（F08）
export type TreeNode<T> = { item: T; children: TreeNode<T>[] }

export function buildTree<T extends { id: number; parentId: number | null; position: number }>(
  items: T[]
): TreeNode<T>[] {
  const nodes = new Map(items.map((item) => [item.id, { item, children: [] as TreeNode<T>[] }]))
  const roots: TreeNode<T>[] = []
  for (const node of nodes.values()) {
    // 親が見つからない行は、一番上に出す
    const parent = node.item.parentId === null ? undefined : nodes.get(node.item.parentId)
    ;(parent ? parent.children : roots).push(node)
  }
  const sort = (list: TreeNode<T>[]): void => {
    list.sort((a, b) => a.item.position - b.item.position)
    list.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

// 取り込みの結果を、画面に出す文言（辞書のキー）にする。取りやめたときは何も出さない
export function importMessageKey(outcome: {
  status: 'imported' | 'not-found' | 'cancelled' | 'unreadable'
  imported?: number
  failed?: number
}): string | undefined {
  switch (outcome.status) {
    case 'imported':
      return (outcome.failed ?? 0) > 0 ? 'bookmark.importedWithFailures' : 'bookmark.imported'
    case 'not-found':
      return 'bookmark.importNotFound'
    case 'unreadable':
      return 'bookmark.importUnreadable'
    default:
      return undefined
  }
}
