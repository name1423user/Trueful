import { z } from 'zod'
import type { OmniboxCandidate } from '../omnibox/flows/omniboxSuggest'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// 統合検索欄（F10）のチャネル。打った文字列と今の Workspace から、候補を並べて返す
export const omniboxSuggest = defineChannel<OmniboxCandidate[]>()(
  channelNames.omniboxSuggest,
  z
    .object({
      query: z.string().max(2048),
      workspaceId: z.int().positive().nullable()
    })
    .strict()
)
