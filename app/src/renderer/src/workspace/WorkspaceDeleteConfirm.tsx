import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { IpcErrorCode } from './useWorkspaces'

// Workspace を削除する前の確認（F01、T2-5c の方針）。ログイン（Cookie）とサイトのデータも消えることを示す。
// ページ（WebContentsView）は UI の上に重なるので、作成画面と同じく、ページを隠した中央に出す。
// 最初のフォーカスは「やめる」（Enter で消してしまわないように）。Esc でもやめる。
// 表示中は、呼び出し側が左パネルと上端を inert にする（ほかの削除・切り替えと競合させない）
export function WorkspaceDeleteConfirm(props: {
  name: string
  onDelete: () => Promise<IpcErrorCode | undefined>
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<IpcErrorCode>()
  // 二度押しは同期的に止める（SPEC のエッジケース「作成・削除の二重操作」）
  const busy = useRef(false)
  // 失敗して戻ったら、押せるようになった「削除する」へフォーカスを戻す（処理中は disabled で外れている）
  const deleteButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (error) deleteButton.current?.focus()
  }, [error])

  const remove = async (): Promise<void> => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(undefined)
    const code = await props.onDelete()
    // 成功したら、呼び出し側がこの画面を閉じる
    if (code) {
      busy.current = false
      setPending(false)
      setError(code)
    }
  }

  return (
    <section
      className="workspace-delete"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="workspace-delete-title"
      aria-describedby="workspace-delete-lead"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy.current) props.onCancel()
      }}
    >
      <h1 id="workspace-delete-title">{t('workspace.deleteTitle', { name: props.name })}</h1>
      <p id="workspace-delete-lead">{t('workspace.deleteLead')}</p>
      {error && <p role="alert">{t(`error.${error}`)}</p>}
      <div className="actions">
        <button
          ref={deleteButton}
          type="button"
          className="danger"
          onClick={() => void remove()}
          disabled={pending}
        >
          {pending ? t('workspace.deleting') : t('workspace.deleteConfirm')}
        </button>
        <button type="button" autoFocus onClick={props.onCancel} disabled={pending}>
          {t('workspace.cancel')}
        </button>
      </div>
    </section>
  )
}
