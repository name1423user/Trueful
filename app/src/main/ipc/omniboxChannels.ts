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

// 「その場の答え」のコピー。Renderer は Clipboard API を使えない（権限の判定が拒否する）ので、Main の clipboard に書く。
// 答えは MAX_INPUT（2000）文字までの入力から作られるが、Base64 などで伸びるので余裕を見る
export const omniboxCopy = defineChannel<null>()(
  channelNames.omniboxCopy,
  z.object({ text: z.string().min(1).max(16_384) }).strict()
)
