import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Workspace } from '../workspace/useWorkspaces'
import { tabTitle } from './tabTitle'
import type { Tab } from './useTabs'

// タブを別の Workspace へ移す操作（F17）。「ログイン状態が変わります」の確認（設定 hideMoveTabNotice で省ける）を経て、
// Main の tab:move を呼ぶ。終わったら onMoved で、タブ列と Workspace の一覧を読み直す（移動先の復帰・上限による休止で、
// 一覧の状態が変わるため）。結果は status（読み上げと、少しの間の表示）で知らせる
export function useMoveTab(options: { workspaceId: number | null; onMoved: () => Promise<void> }): {
  pending: { tab: Tab; to: Workspace } | null
  status: string
  request: (tab: Tab, to: Workspace) => Promise<void>
  confirm: (dontAskAgain: boolean) => Promise<void>
  cancel: () => void
} {
  const { t } = useTranslation()
  const { workspaceId, onMoved } = options
  const [pending, setPending] = useState<{ tab: Tab; to: Workspace } | null>(null)
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (status === '') return
    const timer = setTimeout(() => setStatus(''), 4000)
    return () => clearTimeout(timer)
  }, [status])

  const perform = useCallback(
    async (tab: Tab, to: Workspace): Promise<void> => {
      if (workspaceId === null) return
      const result = await window.trueful.tab.move(workspaceId, tab.id, to.id)
      await onMoved()
      setStatus(
        result.ok ? t('tab.moved', { title: tabTitle(t, tab), name: to.name }) : t('tab.moveFailed')
      )
    },
    [workspaceId, onMoved, t]
  )

  const request = useCallback(
    async (tab: Tab, to: Workspace): Promise<void> => {
      const got = await window.trueful.settings.get().catch(() => undefined)
      if (got?.ok && got.value.settings.hideMoveTabNotice) return perform(tab, to)
      setPending({ tab, to })
    },
    [perform]
  )

  const confirm = useCallback(
    async (dontAskAgain: boolean): Promise<void> => {
      if (!pending) return
      setPending(null)
      if (dontAskAgain) {
        await window.trueful.settings.update({ hideMoveTabNotice: true }).catch(() => undefined)
      }
      await perform(pending.tab, pending.to)
    },
    [pending, perform]
  )

  return { pending, status, request, confirm, cancel: () => setPending(null) }
}
