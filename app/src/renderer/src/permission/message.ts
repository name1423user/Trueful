import type { PermissionPrompt } from './usePermissionPrompts'

// 確認の文言（帯と、読み上げのライブ領域で同じものを使う）
export function permissionMessage(
  t: (key: string, options?: Record<string, string>) => string,
  origin: string,
  permission: PermissionPrompt['permission']
): string {
  return t('permission.ask', { origin, permission: t(`permission.name.${permission}`) })
}
