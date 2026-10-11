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
  // 設定を読むまでは OS に合わせる。shortcut: Linux では、設定と OS が違うと起動の直後に一瞬 OS の色が出る
  // （Mac・Windows はウィンドウを作る前に nativeTheme を決めるので出ない）。気になるなら preload で同期に渡す
  apply()
  query.addEventListener('change', apply)
  // 読んだ答えより後の知らせが先に届いていたら、答えは古いので捨てる
  let changed = false
  window.trueful.settings.onChanged((s) => {
    changed = true
    set(s.settings.theme)
  })
  window.trueful.settings.get().then(
    (result) => !changed && result.ok && set(result.value.settings.theme),
    () => undefined
  )
}
