// イベントが呼ばれるたびに、Main の HTTP サーバー（main.mjs）に報告する。
// console は、MV3 の service worker では最初の1行しか Main に届かなかったので使わない。
const REPORT = 'http://127.0.0.1:47813/'
const report = (name, url = '') => fetch(`${REPORT}?e=${encodeURIComponent(name)}&u=${encodeURIComponent(url)}`).catch(() => {})
const hit = (name) => (d) => { if (!d.url?.startsWith(REPORT)) report(name, d.url) }
report('起動', `webRequest=${typeof chrome.webRequest} webNavigation=${typeof chrome.webNavigation}`)
chrome.webRequest.onBeforeRequest.addListener(hit('webRequest.onBeforeRequest'), { urls: ['<all_urls>'] })
chrome.webRequest.onCompleted.addListener(hit('webRequest.onCompleted'), { urls: ['<all_urls>'] })
// webNavigation は Electron 単体にはない（electron-chrome-extensions が足す）
chrome.webNavigation?.onCommitted.addListener(hit('webNavigation.onCommitted'))
report('登録', `hasListeners=${chrome.webRequest.onBeforeRequest.hasListeners()}`)
