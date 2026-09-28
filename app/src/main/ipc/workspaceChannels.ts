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
      name: z.string().trim().min(1).max(100),
      mode: z.enum(WORKSPACE_MODES),
      requestId: z.uuid()
    })
    .strict()
)
export const workspaceSwitch = defineChannel<Workspace>()(
  channelNames.workspaceSwitch,
  z.object({ id: z.int().positive() }).strict()
)
