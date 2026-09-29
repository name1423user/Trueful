import { z } from 'zod'
import type { Download } from '../download/services/downloadDB'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// ダウンロード（F07）のチャネル。保存先は Renderer から渡さない（記録の id だけを渡す）
const id = z.int().positive()

// 新しい順。Workspace を指定するとその Workspace の分だけ
export const downloadList = defineChannel<Download[]>()(
  channelNames.downloadList,
  z.object({ workspaceId: id.optional() }).strict()
)
// 一時停止・再開・取り消しは、動いているダウンロードだけ。できたら true
export const downloadPause = defineChannel<boolean>()(
  channelNames.downloadPause,
  z.object({ id }).strict()
)
export const downloadResume = defineChannel<boolean>()(
  channelNames.downloadResume,
  z.object({ id }).strict()
)
export const downloadCancel = defineChannel<boolean>()(
  channelNames.downloadCancel,
  z.object({ id }).strict()
)
// 保存したファイルをフォルダで表示する。記録がなければ false
export const downloadShowInFolder = defineChannel<boolean>()(
  channelNames.downloadShowInFolder,
  z.object({ id }).strict()
)
