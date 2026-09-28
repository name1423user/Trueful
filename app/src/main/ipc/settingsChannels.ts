import { z } from 'zod'
import type { SettingsSnapshot } from '../settings/flows/settingsStore'
import { settingsPatchSchema, type Settings } from '../settings/services/settingsSchema'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// 設定（F14）のチャネル
export const settingsGet = defineChannel<SettingsSnapshot>()(
  channelNames.settingsGet,
  z.undefined()
)
export const settingsUpdate = defineChannel<Settings>()(
  channelNames.settingsUpdate,
  settingsPatchSchema
)
