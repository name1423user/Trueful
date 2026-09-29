import { z } from 'zod'
import type { SitePermission } from '../permission/services/permissionDB'
import { PERMISSIONS } from '../permission/services/permissionMap'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// サイトの権限（F16）のチャネル。設定の画面から、記憶した許可・拒否を見て、取り消す
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
      origin: z
        .string()
        .max(2048)
        .refine((o) => /^https?:\/\//i.test(o), { message: 'http・https のサイト' }),
      permission: z.enum(PERMISSIONS)
    })
    .strict()
)
