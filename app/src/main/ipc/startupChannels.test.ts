import { describe, expect, it } from 'vitest'
import { startupMode } from './startupChannels'

describe('startup:* の引数', () => {
  it('mode: 引数なし', () => {
    expect(startupMode.args.safeParse(undefined).success).toBe(true)
    expect(startupMode.args.safeParse({}).success).toBe(false)
  })
})
