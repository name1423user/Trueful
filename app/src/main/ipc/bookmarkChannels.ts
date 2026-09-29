import { z } from 'zod'
import type { Bookmark } from '../bookmark/services/bookmarkDB'
import type { FileImportResult } from '../bookmark/flows/importFromFile'
import { channelNames } from './channelNames'
import { defineChannel } from './channels'

// ブックマーク（F08）のチャネル。取り込むファイルの場所は、Renderer からは渡さない
// （Chrome のプロファイルは Main が探し、HTML は Main のファイル選択で選ぶ）
const id = z.int().positive()
const title = z.string().max(1000)
const url = z
  .string()
  .max(8192)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'http・https だけ' })

export const bookmarkList = defineChannel<Bookmark[]>()(channelNames.bookmarkList, z.undefined())
export const bookmarkAdd = defineChannel<Bookmark>()(
  channelNames.bookmarkAdd,
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('folder'), title, parentId: id.optional() }).strict(),
    z.object({ kind: z.literal('url'), title, url, parentId: id.optional() }).strict()
  ])
)
export const bookmarkUpdate = defineChannel<null>()(
  channelNames.bookmarkUpdate,
  z
    .object({ id, title: title.optional(), url: url.optional() })
    .strict()
    .refine((v) => v.title !== undefined || v.url !== undefined, { message: 'title か url が必要' })
)
export const bookmarkDelete = defineChannel<null>()(
  channelNames.bookmarkDelete,
  z.object({ id }).strict()
)
// 別のフォルダ（null なら一番上）の一番下へ移す
export const bookmarkMove = defineChannel<null>()(
  channelNames.bookmarkMove,
  z.object({ id, parentId: id.nullable() }).strict()
)
// 取り込み。not-found: Chrome のブックマークが見つからない、cancelled: ファイルを選ばなかった
export type BookmarkImportOutcome = FileImportResult | { status: 'not-found' | 'cancelled' }
export const bookmarkImportChrome = defineChannel<BookmarkImportOutcome>()(
  channelNames.bookmarkImportChrome,
  z.undefined()
)
export const bookmarkImportHtml = defineChannel<BookmarkImportOutcome>()(
  channelNames.bookmarkImportHtml,
  z.undefined()
)
