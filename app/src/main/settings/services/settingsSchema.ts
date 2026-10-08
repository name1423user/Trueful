import { z } from 'zod'

// settings.json の項目（SPEC F14）。項目ごとに検証するので、1つが不正でもほかの項目は残る
const shortcut = z
  .object({
    // 数字だけのキーワードは、組み込みの localhost の近道（F10）とぶつかるので使えない
    keyword: z
      .string()
      .regex(/^[a-z0-9-]{1,20}$/)
      .refine((k) => !/^\d+$/.test(k)),
    urlTemplate: z.url({ protocol: /^https?$/ }).includes('%s')
  })
  .strict()

export const settingsFields = {
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  // 拡張の配置（F15）: 1段目 / 統合検索欄の右 / 両方
  extensionPlacement: z.enum(['rail', 'omnibox', 'both']).default('rail'),
  secondaryPanelOpen: z.boolean().default(true),
  recentTabsCount: z.int().min(1).max(10).default(5),
  // 開発者向けの近道（F10）。数字だけの localhost の近道は組み込みで、ここには入れない
  shortcuts: z
    .array(shortcut)
    .max(50)
    .refine((list) => new Set(list.map((s) => s.keyword)).size === list.length)
    .default([
      { keyword: 'gh', urlTemplate: 'https://github.com/search?q=%s' },
      { keyword: 'npm', urlTemplate: 'https://www.npmjs.com/search?q=%s' },
      { keyword: 'mdn', urlTemplate: 'https://developer.mozilla.org/search?q=%s' }
    ]),
  // Workspace の切り替えの修飾キー（F01）。auto は macOS で Ctrl、Windows・Linux で Alt
  workspaceSwitchModifier: z.enum(['auto', 'ctrl', 'alt']).default('auto'),
  // タブを別の Workspace へ移すときの「ログイン状態が変わります」の確認を、もう出さない（F17）
  hideMoveTabNotice: z.boolean().default(false),
  showDeveloperHome: z.boolean().default(true),
  developerHomeAfterMinutes: z.int().min(1).max(10080).default(60),
  historyRetentionDays: z.int().min(1).max(3650).default(90),
  adBlockEnabled: z.boolean().default(true),
  // 広告ブロックを外すサイト（ホスト名）
  adBlockExcludedSites: z
    .array(
      z
        .string()
        .max(253)
        .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/)
    )
    .max(1000)
    .default([]),
  developerMode: z.boolean().default(false),
  sentryEnabled: z.boolean().default(false)
}

export const settingsSchema = z.object(settingsFields).strict()
export type Settings = z.infer<typeof settingsSchema>
export type SettingsKey = keyof Settings

// 更新は一部の項目だけ（知らない項目は拒否する）
// 値が undefined の項目も拒否する（IPC は undefined のキーをそのまま運び、更新で値が消えてしまうため）
export const settingsPatchSchema = z
  .object(Object.fromEntries(Object.entries(settingsFields).map(([k, v]) => [k, v.unwrap()])))
  .partial()
  .strict()
  .refine((patch) => Object.values(patch).every((v) => v !== undefined), {
    message: '値が undefined の項目がある'
  }) as unknown as z.ZodType<Partial<Settings>>

export const defaultSettings = (): Settings => settingsSchema.parse({})

// 読み込んだ値を項目ごとに検証する。不正な項目は既定値にし、その名前を返す。知らない項目は捨てる
export function parseSettings(raw: unknown): { settings: Settings; invalidKeys: SettingsKey[] } {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const settings = defaultSettings()
  const invalidKeys: SettingsKey[] = []
  for (const key of Object.keys(settingsFields) as SettingsKey[]) {
    if (!Object.hasOwn(input, key)) continue
    const parsed = settingsFields[key].safeParse((input as Record<string, unknown>)[key])
    if (parsed.success) Object.assign(settings, { [key]: parsed.data })
    else invalidKeys.push(key)
  }
  return { settings, invalidKeys }
}
