import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { IpcErrorCode, WorkspaceMode } from './useWorkspaces'

const MODES: WorkspaceMode[] = ['production', 'development', 'testing', 'custom']

// Workspace を作る画面（F01）。0個のときは中央に、それ以外は「追加」から出す
export function WorkspaceCreateForm(props: {
  onCreate: (name: string, mode: WorkspaceMode) => Promise<IpcErrorCode | undefined>
  onCancel?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<WorkspaceMode>('development')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<IpcErrorCode>()

  // 処理中は再実行を受け付けない（SPEC のエッジケース「作成・削除の二重操作」）
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (pending || name.trim() === '') return
    setPending(true)
    setError(undefined)
    const code = await props.onCreate(name, mode)
    setPending(false)
    if (code) setError(code)
    else setName('')
  }

  return (
    <form className="workspace-create" onSubmit={submit} aria-labelledby="workspace-create-title">
      <h1 id="workspace-create-title">{t('workspace.createTitle')}</h1>
      <p>{t('workspace.createLead')}</p>
      <label>
        {t('workspace.nameLabel')}
        <input
          name="name"
          value={name}
          maxLength={100}
          autoFocus
          placeholder={t('workspace.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <fieldset>
        <legend>{t('workspace.modeLabel')}</legend>
        {MODES.map((m) => (
          <label key={m} className="mode-option">
            <input
              type="radio"
              name="mode"
              value={m}
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            <span className={`mode-dot mode-${m}`} aria-hidden="true" />
            {t(`workspace.mode.${m}`)}
          </label>
        ))}
      </fieldset>
      {error && <p role="alert">{t(`error.${error}`)}</p>}
      <div className="actions">
        <button type="submit" disabled={pending || name.trim() === ''}>
          {pending ? t('workspace.creating') : t('workspace.create')}
        </button>
        {props.onCancel && (
          <button type="button" onClick={props.onCancel} disabled={pending}>
            {t('workspace.cancel')}
          </button>
        )}
      </div>
    </form>
  )
}
