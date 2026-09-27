chrome.runtime.onInstalled.addListener(() => chrome.action.setBadgeText({ text: 'ok' }))
// T0-5: chrome.webRequest が呼ばれた回数をバッジと storage に出す。内蔵広告ブロックと衝突すると増えなくなる
let seen = 0
chrome.webRequest.onBeforeRequest.addListener(() => {
  seen += 1
  chrome.action.setBadgeText({ text: String(seen) })
  chrome.storage.local.set({ webRequestSeen: seen })
}, { urls: ['<all_urls>'] })
