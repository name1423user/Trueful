import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildTree, type TreeNode } from './tree'
import type { Bookmark } from './useBookmarks'

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
  onImport: (source: 'chrome' | 'html') => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<number>()
  // 編集を閉じたら、フォーカスをその行の「編集」ボタンに戻す（見えなくなったボタンにフォーカスを残さない）
  const lastEdited = useRef<number>(undefined)
  useEffect(() => {
    if (editing === undefined && lastEdited.current !== undefined) {
      document.querySelector<HTMLElement>(`[data-bookmark-edit="${lastEdited.current}"]`)?.focus()
      lastEdited.current = undefined
    }
  }, [editing])
  const startEdit = (id: number): void => {
    lastEdited.current = id
    setEditing(id)
  }
  const row = (node: TreeNode<Bookmark>): React.JSX.Element => {
    const b = node.item
    if (editing === b.id) {
      return (
        <EditRow
          key={b.id}
          bookmark={b}
          onSave={async (patch) => {
            const ok = await props.onUpdate(b.id, patch)
            if (ok) setEditing(undefined)
            return ok
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
          data-bookmark-edit={b.id}
          onClick={() => startEdit(b.id)}
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
        <button type="button" className="bookmark-import" onClick={() => props.onImport('chrome')}>
          {t('bookmark.importChrome')}
        </button>
        <button type="button" className="bookmark-import" onClick={() => props.onImport('html')}>
          {t('bookmark.importHtml')}
        </button>
      </div>
      <p role="status" className="bookmark-status">
        {props.message}
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
  onSave: (patch: { title: string; url?: string }) => Promise<boolean>
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [title, setTitle] = useState(props.bookmark.title)
  const [url, setUrl] = useState(props.bookmark.url ?? '')
  const [failed, setFailed] = useState(false)
  const isUrl = props.bookmark.kind === 'url'
  return (
    <li className="bookmark-item">
      <form
        className="bookmark-edit"
        onKeyDown={(e) => {
          if (e.key === 'Escape') props.onCancel()
        }}
        onSubmit={(e) => {
          e.preventDefault()
          void props.onSave(isUrl ? { title, url } : { title }).then((ok) => setFailed(!ok))
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
        {failed && <p role="alert">{t('bookmark.saveFailed')}</p>}
        <button type="submit">{t('bookmark.save')}</button>
        <button type="button" onClick={props.onCancel}>
          {t('bookmark.cancel')}
        </button>
      </form>
    </li>
  )
}
