import { describe, expect, it } from 'vitest'
import { startupMode, startupNotices } from './startupChannels'

describe('startup:* の引数', () => {
  it('mode: 引数なし', () => {
    expect(startupMode.args.safeParse(undefined).success).toBe(true)
    expect(startupMode.args.safeParse({}).success).toBe(false)
  })

  it('notices: 引数なし', () => {
    expect(startupNotices.args.safeParse(undefined).success).toBe(true)
    expect(startupNotices.args.safeParse({}).success).toBe(false)
  })
})
