import { beforeEach, describe, expect, it } from 'vitest'
import { PermissionPrompts } from './permissionPrompts'

let notified: number
let prompts: PermissionPrompts
beforeEach(() => {
  notified = 0
  prompts = new PermissionPrompts(() => notified++)
})

describe('PermissionPrompts', () => {
  it('確認を並べ、画面に知らせる。答えると、その答えで終わり、一覧から消える', async () => {
    const signal = new AbortController().signal
    const a = prompts.ask(1, 'https://a.example', 'geolocation', signal)
    const b = prompts.ask(2, 'https://b.example', 'camera', signal)
    expect(prompts.list()).toEqual([
      { id: 1, workspaceId: 1, origin: 'https://a.example', permission: 'geolocation' },
      { id: 2, workspaceId: 2, origin: 'https://b.example', permission: 'camera' }
    ])
    expect(notified).toBe(2)

    expect(prompts.answer(1, 'allow')).toBe(true)
    expect(await a).toBe('allow')
    expect(prompts.list().map((p) => p.id)).toEqual([2])
    expect(notified).toBe(3)

    expect(prompts.answer(2, 'dismissed')).toBe(true)
    expect(await b).toBe('dismissed')
    expect(prompts.list()).toEqual([])
  })

  it('ない id・答え終わった id への答えは false で、何も変えない', async () => {
    const p = prompts.ask(1, 'https://a.example', 'notifications', new AbortController().signal)
    expect(prompts.answer(99, 'allow')).toBe(false)
    expect(prompts.answer(1, 'deny')).toBe(true)
    expect(prompts.answer(1, 'allow')).toBe(false)
    expect(await p).toBe('deny')
  })

  it('止められたら（Workspace の削除など）答えなしで終わり、一覧から消える', async () => {
    const controller = new AbortController()
    const p = prompts.ask(1, 'https://a.example', 'microphone', controller.signal)
    controller.abort()
    expect(await p).toBe('dismissed')
    expect(prompts.list()).toEqual([])
    expect(notified).toBe(2)
    expect(prompts.answer(1, 'allow')).toBe(false)
  })

  it('始める前に止められていたら、並べずに答えなし', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await prompts.ask(1, 'https://a.example', 'midi', controller.signal)).toBe('dismissed')
    expect(prompts.list()).toEqual([])
    expect(notified).toBe(0)
  })

  it('全部を答えなしにできる（ウィンドウを閉じたとき）', async () => {
    const signal = new AbortController().signal
    const a = prompts.ask(1, 'https://a.example', 'geolocation', signal)
    const b = prompts.ask(1, 'https://b.example', 'camera', signal)
    prompts.dismissAll()
    expect(await a).toBe('dismissed')
    expect(await b).toBe('dismissed')
    expect(prompts.list()).toEqual([])
  })
})
