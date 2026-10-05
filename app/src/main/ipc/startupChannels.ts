import { z } from 'zod'
import type { StartupMode } from '../startup/services/startupMode'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// 起動（F11）のチャネル。起動したときに決めた「復元」か「Developer Home」かを返す（起動している間は同じ）
export const startupMode = defineChannel<StartupMode>()(channelNames.startupMode, z.undefined())
