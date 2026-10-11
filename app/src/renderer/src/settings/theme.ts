type Theme = 'system' | 'light' | 'dark'

// 画面のテーマ（F14）。html の data-theme を 'light' か 'dark' にする（main.css が色を切り替える）。
// 'system' は OS のライト・ダークに合わせ、OS が変わったら追いかける。
// Main の nativeTheme だけに任せないのは、Linux では UI の prefers-color-scheme が追いかけないため
export function startTheme(): void {
  const query = matchMedia('(prefers-color-scheme: dark)')
  let theme: Theme = 'system'
  const apply = (): void => {
    document.documentElement.dataset.theme =
      theme === 'system' ? (query.matches ? 'dark' : 'light') : theme
  }
  const set = (next: Theme): void => {
    theme = next
    apply()
  }
  // 設定を読むまでは OS に合わせる
  apply()
  query.addEventListener('change', apply)
  window.trueful.settings.onChanged((s) => set(s.settings.theme))
  window.trueful.settings.get().then(
    (result) => result.ok && set(result.value.settings.theme),
    () => undefined
  )
}
