import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type SitePermission = Extract<
  Awaited<ReturnType<Window['trueful']['permission']['list']>>,
  { ok: true }
>['value'][number]

// 記憶したサイトの権限（F16「設定から取り消せる」）。全 Workspace の分を、左パネルの Workspace の並び・サイト・権限の順に並べる
// （一覧にない Workspace の分は出さない）。取り消すと、次にそのサイトが要求したときに、また確認する
// （動いているカメラなどは止めない）。開いたときに読み、取り消したらその行を消す
export function SitePermissions(props: {
  workspaces: { id: number; name: string }[]
  disabled: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const [list, setList] = useState<SitePermission[]>()
  const [problem, setProblem] = useState<'loadFailed' | 'revokeFailed'>()
  useEffect(() => {
    let alive = true
    window.trueful.permission.list().then(
      (result) => {
        if (!alive) return
        if (result.ok) setList(result.value)
        else setProblem('loadFailed')
      },
      () => alive && setProblem('loadFailed')
    )
    return () => {
      alive = false
    }
  }, [])

  // 取り消したボタンの代わりに、次の行（なければ前の行）の「取り消す」へ。なければまとまりへ
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
    if (!result?.ok) return setProblem('revokeFailed')
    setProblem(undefined)
    focusAfterRevoke.current = index
    setList((l) => l?.filter((x) => x !== p))
  }

  const order = new Map(props.workspaces.map((w, i) => [w.id, i]))
  const rows = (list ?? [])
    .filter((p) => order.has(p.workspaceId))
    .map((p) => ({ ...p, label: t(`permission.name.${p.permission}`), source: p }))
    .sort(
      (a, b) =>
        order.get(a.workspaceId)! - order.get(b.workspaceId)! ||
        a.origin.localeCompare(b.origin) ||
        a.label.localeCompare(b.label, 'ja')
    )
  return (
    <fieldset disabled={props.disabled} ref={groupRef} tabIndex={-1}>
      <legend>{t('settings.sitePermissions')}</legend>
      {problem && (
        <p role="alert">
          {t(`settings.sitePermissions${problem === 'loadFailed' ? 'LoadFailed' : 'RevokeFailed'}`)}
        </p>
      )}
      {list && rows.length === 0 && (
        <p className="settings-hint">{t('settings.sitePermissionsEmpty')}</p>
      )}
      {rows.length > 0 && (
        <ul className="site-permission-list" ref={listRef}>
          {rows.map((p, index) => {
            const workspace = props.workspaces[order.get(p.workspaceId)!]!.name
            return (
              <li key={`${p.workspaceId} ${p.origin} ${p.permission}`}>
                <span>{workspace}</span>
                <span className="site-permission-origin">{p.origin}</span>
                <span>{p.label}</span>
                <span>{t(`settings.decision.${p.decision}`)}</span>
                <button
                  type="button"
                  aria-label={t('settings.revokeLabel', {
                    workspace,
                    origin: p.origin,
                    permission: p.label
                  })}
                  onClick={() => void revoke(p.source, index)}
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
