// チャネル名だけを並べる。preload はこのファイルだけを値として import する（zod を preload に持ち込まないため）
export const channelNames = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  workspaceList: 'workspace:list',
  workspaceCreate: 'workspace:create',
  workspaceSwitch: 'workspace:switch',
  tabList: 'tab:list',
  tabCreate: 'tab:create',
  tabClose: 'tab:close',
  tabReopenClosed: 'tab:reopenClosed',
  tabActivate: 'tab:activate',
  tabNavigate: 'tab:navigate',
  viewSetBounds: 'view:setBounds',
  // Main → Renderer の知らせ（webContents.send。ADR-007）
  settingsChanged: 'settings:changed',
  tabPageChanged: 'tab:pageChanged'
} as const
