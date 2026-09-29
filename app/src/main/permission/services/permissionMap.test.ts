import { describe, expect, it } from 'vitest'
import { originOf, requiredPermissions } from './permissionMap'

describe('Electron の権限名から、記憶する権限への対応（F16）', () => {
  it('media は、カメラ・マイクの種類ごとに。要求に種類がなければ両方', () => {
    expect(requiredPermissions('media', { mediaTypes: ['video'] })).toEqual(['camera'])
    expect(requiredPermissions('media', { mediaTypes: ['audio'] })).toEqual(['microphone'])
    expect(requiredPermissions('media', { mediaTypes: ['video', 'audio'] })).toEqual([
      'camera',
      'microphone'
    ])
    expect(requiredPermissions('media', {})).toEqual(['camera', 'microphone'])
  })

  it('通知・位置情報・クリップボード読み取り・画面共有・MIDI・アイドル検知に対応する', () => {
    expect(requiredPermissions('notifications')).toEqual(['notifications'])
    expect(requiredPermissions('geolocation')).toEqual(['geolocation'])
    expect(requiredPermissions('clipboard-read')).toEqual(['clipboard-read'])
    expect(requiredPermissions('display-capture')).toEqual(['display-capture'])
    expect(requiredPermissions('midi')).toEqual(['midi'])
    expect(requiredPermissions('idle-detection')).toEqual(['idle-detection'])
  })

  it('それ以外（全画面・外部アプリを開く・ポインタのロックなど）は、確認の対象にせず、空（常に拒否）', () => {
    for (const name of [
      'fullscreen',
      'openExternal',
      'pointerLock',
      'clipboard-sanitized-write',
      'unknown-x'
    ]) {
      expect(requiredPermissions(name)).toEqual([])
    }
  })
})

describe('サイト（origin）', () => {
  it('http・https の URL から origin を取り出す。それ以外（file・about・不正）は undefined', () => {
    expect(originOf('https://meet.example.com/room?x=1#y')).toBe('https://meet.example.com')
    expect(originOf('http://localhost:3000/a')).toBe('http://localhost:3000')
    for (const bad of [
      'file:///etc/passwd',
      'about:blank',
      'javascript:alert(1)',
      'not a url',
      ''
    ]) {
      expect(originOf(bad)).toBeUndefined()
    }
  })
})
