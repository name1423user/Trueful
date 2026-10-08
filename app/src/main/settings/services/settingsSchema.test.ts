import { describe, expect, it } from 'vitest'
import { defaultSettings, parseSettings, settingsPatchSchema } from './settingsSchema'

describe('settingsSchema', () => {
  it('既定値は SPEC F14 のとおり', () => {
    expect(defaultSettings()).toMatchObject({
      theme: 'system',
      extensionPlacement: 'rail',
      recentTabsCount: 5,
      developerHomeAfterMinutes: 60,
      historyRetentionDays: 90,
      adBlockEnabled: true,
      developerMode: false,
      sentryEnabled: false,
      hideMoveTabNotice: false
    })
    expect(defaultSettings().shortcuts.map((s) => s.keyword)).toEqual(['gh', 'npm', 'mdn'])
  })

  it('不正な項目だけを既定値にし、正しい項目は残す。知らない項目は捨てる', () => {
    const { settings, invalidKeys } = parseSettings({
      theme: 'dark',
      recentTabsCount: 99,
      historyRetentionDays: '30',
      unknownKey: true
    })
    expect(settings.theme).toBe('dark')
    expect(settings.recentTabsCount).toBe(5)
    expect(settings.historyRetentionDays).toBe(90)
    expect(invalidKeys).toEqual(['recentTabsCount', 'historyRetentionDays'])
    expect(settings).not.toHaveProperty('unknownKey')
  })

  it('オブジェクトでない中身は、全部既定値にする', () => {
    for (const raw of [null, [], 'text', 1]) {
      expect(parseSettings(raw)).toEqual({ settings: defaultSettings(), invalidKeys: [] })
    }
  })

  it('近道は https と %s を含む URL だけを受け付ける', () => {
    const shortcuts = (urlTemplate: string): unknown => [{ keyword: 'x', urlTemplate }]
    expect(parseSettings({ shortcuts: shortcuts('https://x.example/?q=%s') }).invalidKeys).toEqual(
      []
    )
    for (const bad of ['javascript:alert(1)//%s', 'https://x.example/', 'file:///%s']) {
      expect(parseSettings({ shortcuts: shortcuts(bad) }).invalidKeys, bad).toEqual(['shortcuts'])
    }
  })

  it('近道のキーワードは数字だけ（localhost の近道とぶつかる）と重複を拒否する', () => {
    const url = 'https://x.example/?q=%s'
    expect(
      parseSettings({ shortcuts: [{ keyword: '8080', urlTemplate: url }] }).invalidKeys
    ).toEqual(['shortcuts'])
    const dup = [
      { keyword: 'gh', urlTemplate: url },
      { keyword: 'gh', urlTemplate: url }
    ]
    expect(parseSettings({ shortcuts: dup }).invalidKeys).toEqual(['shortcuts'])
  })

  it('広告ブロックを外すサイトは、ホスト名の形だけを受け付ける', () => {
    expect(
      parseSettings({ adBlockExcludedSites: ['example.com', 'a-b.example.jp'] }).invalidKeys
    ).toEqual([])
    for (const bad of ['javascript:alert(1)', '*', 'https://example.com', 'Example.com ']) {
      expect(parseSettings({ adBlockExcludedSites: [bad] }).invalidKeys, bad).toEqual([
        'adBlockExcludedSites'
      ])
    }
  })

  it('更新は一部の項目だけを受け付け、知らない項目や不正な値は拒否する', () => {
    expect(settingsPatchSchema.safeParse({ theme: 'light' }).success).toBe(true)
    expect(settingsPatchSchema.safeParse({}).success).toBe(true)
    expect(settingsPatchSchema.safeParse({ theme: 'blue' }).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ nope: 1 }).success).toBe(false)
    // 値が undefined の項目は拒否する（更新で値が消えないように）
    expect(settingsPatchSchema.safeParse({ theme: undefined }).success).toBe(false)
    // 既定値で埋めない（送られていない項目は変えない）
    expect(settingsPatchSchema.parse({ theme: 'light' })).toEqual({ theme: 'light' })
  })
})
