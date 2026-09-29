import { z } from 'zod'
import type { HistoryEntry } from '../history/services/historyDB'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// 閲覧履歴（F09）のチャネル
export const historySearch = defineChannel<HistoryEntry[]>()(
  channelNames.historySearch,
  z
    .object({
      query: z.string().max(500),
      workspaceId: z.int().positive().optional(),
      limit: z.int().min(1).max(100).optional()
    })
    .strict()
)
// 訪問の時刻（Unix ミリ秒）の範囲。両方省略すると全部消す。返事は消した訪問の数
export const historyDelete = defineChannel<{ removed: number }>()(
  channelNames.historyDelete,
  z
    .object({
      fromMs: z.int().nonnegative().optional(),
      toMs: z.int().nonnegative().optional()
    })
    .strict()
    .refine((r) => r.fromMs === undefined || r.toMs === undefined || r.fromMs <= r.toMs)
)
