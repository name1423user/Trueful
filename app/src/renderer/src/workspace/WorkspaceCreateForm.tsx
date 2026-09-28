import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { IpcErrorCode, WorkspaceMode } from './useWorkspaces'

const MODES: WorkspaceMode[] = ['production', 'development', 'testing', 'custom']
const NAME_MAX = 100

// Workspace を作る画面（F01）。0個のときは中央に、それ以外は「追加」から出す
export function WorkspaceCreateForm(props: {
  onCreate: (
    name: string,
    mode: WorkspaceMode,
    requestId: string
  ) => Promise<IpcErrorCode | undefined>
  onCancel?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<WorkspaceMode>('development')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<IpcErrorCode>()
  // 1回の作成（成功するまで）に1つの requestId。失敗して送り直すときも同じ ID を使う
  // （Main は失敗した依頼を忘れるので、作り直しになる）
  const requestId = useRef(crypto.randomUUID())
  // 二度押しは同期的に止める（state の pending は描き直すまで古い値のまま）
  const busy = useRef(false)

  // 文字数は Main と同じく、UTF-16 の単位ではなく文字で数える（𠮷 や絵文字も1文字）
  const length = [...name.trim()].length
  const tooLong = length > NAME_MAX

  // 処理中は再実行を受け付けない（SPEC のエッジケース「作成・削除の二重操作」）
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy.current || length === 0 || tooLong) return
    busy.current = true
    setPending(true)
    setError(undefined)
    const code = await props.onCreate(name, mode, requestId.current)
    busy.current = false
    setPending(false)
    if (code) {
      setError(code)
    } else {
      requestId.current = crypto.randomUUID()
      setName('')
    }
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
          autoFocus
          aria-invalid={tooLong || undefined}
          placeholder={t('workspace.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {tooLong && <p role="alert">{t('workspace.nameTooLong', { max: NAME_MAX })}</p>}
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
        <button type="submit" disabled={pending || length === 0 || tooLong}>
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
