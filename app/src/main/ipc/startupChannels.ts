import { z } from 'zod'
import type { DatabaseRecovery } from '../db/flows/recoverDatabase'
import type { SettingsProblem } from '../settings/services/settingsFile'
import type { StartupMode } from '../startup/services/startupMode'
import type { WorkspaceFileNotice } from '../workspace/flows/workspaceFileFlows'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// 起動（F11）のチャネル。起動したときに決めた「復元」か「Developer Home」かを返す（起動している間は同じ）
export const startupMode = defineChannel<StartupMode>()(channelNames.startupMode, z.undefined())
// 起動のときに知らせること（F12）。壊れた DB をバックアップから戻した・新しく作った（DatabaseRecovery）と、
// ADR-012 の3パターン: ① マニフェストを書き直した（軽く知らせる）、② 作成が途中で終わっていた（作成へ誘導）、
// ③ Workspace のファイルが消えていた（強く知らせ、そのまま使うか削除するかを選んでもらう）
export type StartupNotice =
  | DatabaseRecovery
  | WorkspaceFileNotice
  // settings.json が壊れていた・正しくない値があった・読み書きできない（既定値で起動した。T1-4）
  | { kind: 'settings'; problem: SettingsProblem }

// 起動のときに知らせること。なければ空
export const startupNotices = defineChannel<StartupNotice[]>()(
  channelNames.startupNotices,
  z.undefined()
)
