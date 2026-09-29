import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildTree, importMessageKey, type TreeNode } from './tree'
import type { Bookmark, ImportOutcome } from './useBookmarks'

// 左パネルの2段目のブックマーク（F08・F15）。フォルダは入れ子で出し、URL の行を選ぶと今のタブで開く。
// 編集は行の中で（タイトルと URL）、削除は行のボタンで。取り込み（Chrome・HTML）の結果は role="status" で知らせる
export function BookmarkPanel(props: {
  bookmarks: Bookmark[]
  canAddPage: boolean
  message: string | undefined
  onOpen: (url: string) => void
  onAddPage: () => void
  onUpdate: (id: number, patch: { title: string; url?: string }) => Promise<boolean>
  onRemove: (id: number) => void
  onImport: (source: 'chrome' | 'html') => Promise<ImportOutcome | undefined>
}): React.JSX.Element {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<number>()
  const [result, setResult] = useState<string>()
  const runImport = async (source: 'chrome' | 'html'): Promise<void> => {
    const outcome = await props.onImport(source)
    // 呼び出しに失敗したときは「読めない」と同じ扱い。ファイルを選ばなかったときは何も出さない
    const key = outcome ? importMessageKey(outcome) : 'bookmark.importUnreadable'
    const counts = outcome?.status === 'imported' ? outcome : { imported: 0, failed: 0 }
    setResult(key ? t(key, { imported: counts.imported, failed: counts.failed }) : undefined)
  }
  const row = (node: TreeNode<Bookmark>): React.JSX.Element => {
    const b = node.item
    if (editing === b.id) {
      return (
        <EditRow
          key={b.id}
          bookmark={b}
          onSave={async (patch) => {
            if (await props.onUpdate(b.id, patch)) setEditing(undefined)
          }}
          onCancel={() => setEditing(undefined)}
        />
      )
    }
    const name = b.title || b.url || ''
    return (
      <li key={b.id} className="bookmark-item">
        {b.kind === 'folder' ? (
          <span className="bookmark-folder">{name}</span>
        ) : (
          <button
            type="button"
            className="bookmark-row"
            title={b.url ?? ''}
            onClick={() => props.onOpen(b.url!)}
          >
            {name}
          </button>
        )}
        <button
          type="button"
          className="bookmark-action"
          aria-label={t('bookmark.edit', { name })}
          onClick={() => setEditing(b.id)}
        >
          <span aria-hidden="true">✎</span>
        </button>
        <button
          type="button"
          className="bookmark-action"
          aria-label={t('bookmark.remove', { name })}
          onClick={() => props.onRemove(b.id)}
        >
          <span aria-hidden="true">×</span>
        </button>
        {node.children.length > 0 && <ul className="bookmark-list">{node.children.map(row)}</ul>}
      </li>
    )
  }
  const tree = buildTree(props.bookmarks)
  return (
    <nav className="left-panel" aria-label={t('bookmark.listLabel')}>
      <div className="bookmark-tools">
        <button
          type="button"
          className="bookmark-add"
          disabled={!props.canAddPage}
          onClick={props.onAddPage}
        >
          <span aria-hidden="true">+ </span>
          {t('bookmark.addPage')}
        </button>
        <button type="button" className="bookmark-import" onClick={() => void runImport('chrome')}>
          {t('bookmark.importChrome')}
        </button>
        <button type="button" className="bookmark-import" onClick={() => void runImport('html')}>
          {t('bookmark.importHtml')}
        </button>
      </div>
      <p role="status" className="bookmark-status">
        {props.message ?? result}
      </p>
      {tree.length === 0 ? (
        <p className="bookmark-empty">{t('bookmark.empty')}</p>
      ) : (
        <ul className="bookmark-list">{tree.map(row)}</ul>
      )}
    </nav>
  )
}

function EditRow(props: {
  bookmark: Bookmark
  onSave: (patch: { title: string; url?: string }) => Promise<void>
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [title, setTitle] = useState(props.bookmark.title)
  const [url, setUrl] = useState(props.bookmark.url ?? '')
  const isUrl = props.bookmark.kind === 'url'
  return (
    <li className="bookmark-item">
      <form
        className="bookmark-edit"
        onSubmit={(e) => {
          e.preventDefault()
          void props.onSave(isUrl ? { title, url } : { title })
        }}
      >
        <input
          aria-label={t('bookmark.titleLabel')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {isUrl && (
          <input
            aria-label={t('bookmark.urlLabel')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}
        <button type="submit">{t('bookmark.save')}</button>
        <button type="button" onClick={props.onCancel}>
          {t('bookmark.cancel')}
        </button>
      </form>
    </li>
  )
}
