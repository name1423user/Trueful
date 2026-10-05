import { z } from 'zod'
import type { DatabaseRecovery } from '../db/flows/recoverDatabase'
import type { StartupMode } from '../startup/services/startupMode'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// 起動（F11）のチャネル。起動したときに決めた「復元」か「Developer Home」かを返す（起動している間は同じ）
export const startupMode = defineChannel<StartupMode>()(channelNames.startupMode, z.undefined())
// 起動のときに知らせること（壊れた DB をバックアップから戻した・新しく作った。F12）。なければ空
export const startupNotices = defineChannel<DatabaseRecovery[]>()(
  channelNames.startupNotices,
  z.undefined()
)
