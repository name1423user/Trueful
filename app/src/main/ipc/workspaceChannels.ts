import { z } from 'zod'
import { WORKSPACE_MODES, type Workspace } from '../workspace/services/workspaceDB'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// Workspace（F01）のチャネル
export const workspaceList = defineChannel<{ workspaces: Workspace[]; currentId: number | null }>()(
  channelNames.workspaceList,
  z.undefined()
)
// requestId は、二度押しや送り直しで同じ Workspace を2つ作らないための印（Renderer が作る UUID）
export const workspaceCreate = defineChannel<Workspace>()(
  channelNames.workspaceCreate,
  z
    .object({
      // 長さは文字数で数える（DB の CHECK の length() と SPEC の「1〜100文字」に合わせる。絵文字も1文字）
      name: z
        .string()
        .trim()
        .refine((s) => [...s].length >= 1 && [...s].length <= 100),
      mode: z.enum(WORKSPACE_MODES),
      requestId: z.uuid()
    })
    .strict()
)
export const workspaceSwitch = defineChannel<Workspace>()(
  channelNames.workspaceSwitch,
  z.object({ id: z.int().positive() }).strict()
)
// 削除（確認は画面で済ませてから呼ぶ）。返すのは、削除後の今の Workspace の id
export const workspaceDelete = defineChannel<{ currentId: number | null }>()(
  channelNames.workspaceDelete,
  z.object({ id: z.int().positive() }).strict()
)
