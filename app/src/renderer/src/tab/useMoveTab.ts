import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Workspace } from '../workspace/useWorkspaces'
import { tabTitle } from './tabTitle'
import type { Tab } from './useTabs'

// タブを別の Workspace へ移す操作（F17）。「ログイン状態が変わります」の確認（設定 hideMoveTabNotice で省ける）を経て、
// Main の tab:move を呼ぶ。終わったら onMoved で、タブ列と Workspace の一覧を読み直す（移動先の復帰・上限による休止で、
// 一覧の状態が変わるため）。結果は status（読み上げと、少しの間の表示）で知らせる
export function useMoveTab(options: { workspaceId: number | null; onMoved: () => Promise<void> }): {
  pending: { tab: Tab; from: number; to: Workspace } | null
  status: string
  request: (tab: Tab, to: Workspace) => Promise<void>
  confirm: (dontAskAgain: boolean) => Promise<void>
  cancel: () => void
} {
  const { t } = useTranslation()
  const { workspaceId, onMoved } = options
  const [pending, setPending] = useState<{ tab: Tab; from: number; to: Workspace } | null>(null)
  // 答えないまま Workspace が変わったら、確認は捨てる（古い Workspace のタブを、別の Workspace のものとして移さない。
  // 元の Workspace に戻っても出さない）。描画の途中で状態を直す、React の決まった書き方
  const [seenWorkspaceId, setSeenWorkspaceId] = useState(workspaceId)
  if (seenWorkspaceId !== workspaceId) {
    setSeenWorkspaceId(workspaceId)
    setPending(null)
  }
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (status === '') return
    const timer = setTimeout(() => setStatus(''), 4000)
    return () => clearTimeout(timer)
  }, [status])

  // from は、確認を出した（メニューを開いた）ときの Workspace。切り替えの後に古いタブを送らない
  const perform = useCallback(
    async (tab: Tab, from: number, to: Workspace): Promise<void> => {
      try {
        const result = await window.trueful.tab.move(from, tab.id, to.id)
        setStatus(
          result.ok
            ? t('tab.moved', { title: tabTitle(t, tab), name: to.name })
            : t(result.error.code === 'not-found' ? 'tab.moveNotFound' : 'tab.moveFailed')
        )
      } catch {
        setStatus(t('tab.moveFailed'))
      } finally {
        // 結果は先に知らせる。読み直しに失敗しても、移した結果は変わらない
        await onMoved().catch(() => undefined)
      }
    },
    [onMoved, t]
  )

  const request = useCallback(
    async (tab: Tab, to: Workspace): Promise<void> => {
      if (workspaceId === null) return
      const got = await window.trueful.settings.get().catch(() => undefined)
      if (got?.ok && got.value.settings.hideMoveTabNotice) return perform(tab, workspaceId, to)
      setPending({ tab, from: workspaceId, to })
    },
    [perform, workspaceId]
  )

  const confirm = useCallback(
    async (dontAskAgain: boolean): Promise<void> => {
      if (!pending || pending.from !== workspaceId) return
      setPending(null)
      if (dontAskAgain) {
        await window.trueful.settings.update({ hideMoveTabNotice: true }).catch(() => undefined)
      }
      await perform(pending.tab, pending.from, pending.to)
    },
    [pending, perform, workspaceId]
  )

  return { pending, status, request, confirm, cancel: () => setPending(null) }
}
