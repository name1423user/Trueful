import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type SitePermission = Extract<
  Awaited<ReturnType<Window['trueful']['permission']['list']>>,
  { ok: true }
>['value'][number]

// 記憶したサイトの権限（F16「設定から取り消せる」）。全 Workspace の分を、Workspace・サイト・権限の順に並べる。
// 取り消すと、次にそのサイトが要求したときに、また確認する。開いたときと取り消した後に読み直す
export function SitePermissions(props: {
  workspaceName: (id: number) => string | undefined
  disabled: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const [list, setList] = useState<SitePermission[]>()
  const [failed, setFailed] = useState(false)
  // 読み直すたびに増やす（開いたとき・取り消した後）
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let alive = true
    window.trueful.permission.list().then(
      (result) => {
        if (!alive) return
        setFailed(!result.ok)
        if (result.ok) setList(result.value)
      },
      () => alive && setFailed(true)
    )
    return () => {
      alive = false
    }
  }, [version])

  // 取り消したボタンの代わりに、次の行（なければ前の行）の「取り消す」へ。なければ見出しの代わりにまとまりへ
  const listRef = useRef<HTMLUListElement>(null)
  const groupRef = useRef<HTMLFieldSetElement>(null)
  const focusAfterRevoke = useRef<number | null>(null)
  useEffect(() => {
    const index = focusAfterRevoke.current
    if (index === null) return
    focusAfterRevoke.current = null
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ;(buttons[Math.min(index, buttons.length - 1)] ?? groupRef.current)?.focus()
  }, [list])

  const revoke = async (p: SitePermission, index: number): Promise<void> => {
    const { workspaceId, origin, permission } = p
    const result = await window.trueful.permission
      .revoke({ workspaceId, origin, permission })
      .catch(() => undefined)
    if (!result?.ok) return setFailed(true)
    focusAfterRevoke.current = index
    setVersion((v) => v + 1)
  }

  return (
    <fieldset disabled={props.disabled} ref={groupRef} tabIndex={-1}>
      <legend>{t('settings.sitePermissions')}</legend>
      {failed && <p role="alert">{t('settings.sitePermissionsFailed')}</p>}
      {list?.length === 0 && <p className="settings-hint">{t('settings.sitePermissionsEmpty')}</p>}
      {list && list.length > 0 && (
        <ul className="site-permission-list" ref={listRef}>
          {list.map((p, index) => {
            const workspace = props.workspaceName(p.workspaceId) ?? String(p.workspaceId)
            const permission = t(`permission.name.${p.permission}`)
            return (
              <li key={`${p.workspaceId} ${p.origin} ${p.permission}`}>
                <span>{workspace}</span>
                <span className="site-permission-origin">{p.origin}</span>
                <span>{permission}</span>
                <span>{t(`settings.decision.${p.decision}`)}</span>
                <button
                  type="button"
                  aria-label={t('settings.revokeLabel', {
                    workspace,
                    origin: p.origin,
                    permission
                  })}
                  onClick={() => void revoke(p, index)}
                >
                  {t('settings.revoke')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}
