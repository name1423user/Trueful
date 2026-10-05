import { z } from 'zod'
import type { PermissionPrompt } from '../permission/flows/permissionPrompts'
import type { SitePermission } from '../permission/services/permissionDB'
import { originOf, PERMISSIONS } from '../permission/services/permissionMap'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// サイトの権限（F16）のチャネル。設定の画面から、記憶した許可・拒否を見て、取り消す。
// 確認（T3-7b）は、待っているものを読み（変わったら permission:promptsChanged で知らせる）、答える
const id = z.int().positive()

// Workspace の id で絞れる（省略で全部）
export const permissionList = defineChannel<SitePermission[]>()(
  channelNames.permissionList,
  z.object({ workspaceId: id.optional() }).strict()
)
// 取り消すと、また未決になり、次に要求されたら確認する。記憶がなければ false
export const permissionRevoke = defineChannel<boolean>()(
  channelNames.permissionRevoke,
  z
    .object({
      workspaceId: id,
      // 記憶している origin と同じ形（正規化したもの）だけ。表記が違うと、取り消しが黙って何もしなくなる
      origin: z
        .string()
        .max(2048)
        .refine((o) => originOf(o) === o, { message: 'http・https のサイト（origin の形）' }),
      permission: z.enum(PERMISSIONS)
    })
    .strict()
)

// 答えを待っている確認（古い順）
export const permissionPrompts = defineChannel<PermissionPrompt[]>()(
  channelNames.permissionPrompts,
  z.undefined()
)
// 確認に答える。dismissed は「今は決めない」（拒否するが、記憶しない）。ない id なら false
export const permissionAnswer = defineChannel<boolean>()(
  channelNames.permissionAnswer,
  z.object({ id, answer: z.enum(['allow', 'deny', 'dismissed']) }).strict()
)
