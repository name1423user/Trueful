// サイトの権限（F16）。Electron の権限名を、記憶する権限（data-schema.md の site_permission）に対応させる
export const PERMISSIONS = [
  'camera',
  'microphone',
  'notifications',
  'geolocation',
  'clipboard-read',
  'display-capture',
  'midi',
  'idle-detection'
] as const
export type Permission = (typeof PERMISSIONS)[number]

// 要求に必要な権限。確認の対象でないもの（全画面・外部アプリを開く・ポインタのロックなど）は空で、いつも拒否する。
// midiSysex（デバイスへの書き込み）は、midi とは別の権限にしないと、許可が広がるので、決まるまで拒否（空）
// media は、カメラ（video）・マイク（audio）の種類ごと。種類が分からないときは両方
export function requiredPermissions(
  electronPermission: string,
  details?: { mediaTypes?: string[] }
): Permission[] {
  switch (electronPermission) {
    case 'media': {
      const types = details?.mediaTypes
      if (!types || types.length === 0) return ['camera', 'microphone']
      return [
        ...(types.includes('video') ? (['camera'] as const) : []),
        ...(types.includes('audio') ? (['microphone'] as const) : [])
      ]
    }
    case 'notifications':
    case 'geolocation':
    case 'clipboard-read':
    case 'display-capture':
    case 'idle-detection':
      return [electronPermission]
    case 'midi':
      return ['midi']
    default:
      return []
  }
}

// サイトの単位（origin）。http・https 以外（file・about・不正な URL）は undefined
export function originOf(url: string): string | undefined {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : undefined
  } catch {
    return undefined
  }
}
