import { z } from 'zod'
import type { TabState } from '../tab/flows/tabFlows'
import type { Tab } from '../tab/services/tabDB'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// タブ（F02）のチャネル。ページの表示とナビゲーションは T2-2b で足す。
// tab:list は、タブが1つもない Workspace には空のタブを開いてから返す
const id = z.int().positive()

export const tabList = defineChannel<TabState>()(
  channelNames.tabList,
  z.object({ workspaceId: id }).strict()
)
// 新しいタブ（Cmd/Ctrl+T）。URL の解釈（検索語・近道）は T2-2b で行うので、ここでは空のタブだけを開く
export const tabCreate = defineChannel<Tab>()(
  channelNames.tabCreate,
  z.object({ workspaceId: id }).strict()
)
// 閉じる・選ぶは、タブがその Workspace のものかも確かめる（切り替えの後に古い id を送る不具合で、
// 別の Workspace のタブを黙って閉じないため）。違えば not-found
export const tabClose = defineChannel<TabState>()(
  channelNames.tabClose,
  z.object({ workspaceId: id, id }).strict()
)
// 閉じたタブを戻す（Cmd/Ctrl+Shift+T）。戻すものがなければ null
export const tabReopenClosed = defineChannel<Tab | null>()(
  channelNames.tabReopenClosed,
  z.object({ workspaceId: id }).strict()
)
export const tabActivate = defineChannel<Tab>()(
  channelNames.tabActivate,
  z.object({ workspaceId: id, id }).strict()
)

// アドレスバーの入力を開く（URL・検索語・近道の解釈は Main で行う。http・https 以外は開かない）
export const tabNavigate = defineChannel<Tab>()(
  channelNames.tabNavigate,
  z.object({ workspaceId: id, id, input: z.string().max(8192) }).strict()
)
// 戻る・進む・再読み込み・停止
export const tabControl = defineChannel<null>()(
  channelNames.tabControl,
  z.object({ workspaceId: id, id, action: z.enum(['back', 'forward', 'reload', 'stop']) }).strict()
)
// ページを表示する場所（Renderer の空の div の位置と大きさ、CSS ピクセル。ADR-008）
const length = z.int().min(0).max(100_000)
export const viewSetBounds = defineChannel<null>()(
  channelNames.viewSetBounds,
  z.object({ x: length, y: length, width: length, height: length }).strict()
)
