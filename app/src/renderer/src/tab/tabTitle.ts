import type { TFunction } from 'i18next'
import type { Tab } from './useTabs'

// タブの表示名。空のタブは、ページのタイトル（Chromium は about:blank を返す）ではなく「新しいタブ」と出す
export function tabTitle(t: TFunction, tab: Pick<Tab, 'url' | 'title'>): string {
  return tab.url === 'about:blank' ? t('tab.newTab') : tab.title || tab.url
}
