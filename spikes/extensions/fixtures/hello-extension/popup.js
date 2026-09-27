// storage への書き込みと読み出し、chrome.sidePanel の有無を表示する
const out = document.getElementById('out')
chrome.storage.local.get('count').then(async ({ count = 0 }) => {
  await chrome.storage.local.set({ count: count + 1 })
  out.textContent = `開いた回数: ${count + 1} / chrome.sidePanel: ${typeof chrome.sidePanel}`
})
document.getElementById('panel').onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    await chrome.sidePanel.open({ tabId: tab.id })
    out.textContent += ' / open: 成功'
  } catch (e) {
    out.textContent += ` / open: 失敗（${e.message}）`
  }
}
