// 各イベントが呼ばれるたびに console に出す（Main が拾って数える）
const hit = (name) => (d) => console.log(`[probe-ext] ${name} ${d.url ?? ''}`)
console.log(`[probe-ext] 起動 webRequest=${typeof chrome.webRequest} webNavigation=${typeof chrome.webNavigation}`)
chrome.webRequest.onBeforeRequest.addListener(hit('webRequest.onBeforeRequest'), { urls: ['<all_urls>'] })
chrome.webRequest.onCompleted.addListener(hit('webRequest.onCompleted'), { urls: ['<all_urls>'] })
// webNavigation は Electron 単体にはない（electron-chrome-extensions が足す）
chrome.webNavigation?.onCommitted.addListener(hit('webNavigation.onCommitted'))
