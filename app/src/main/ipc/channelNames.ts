// チャネル名だけを並べる。preload はこのファイルだけを値として import する（zod を preload に持ち込まないため）
export const channelNames = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  workspaceList: 'workspace:list',
  workspaceCreate: 'workspace:create',
  workspaceSwitch: 'workspace:switch',
  // Main → Renderer の知らせ（webContents.send。ADR-007）
  settingsChanged: 'settings:changed'
} as const
