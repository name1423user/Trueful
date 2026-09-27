// ツールバー: タブの切り替え、URL 入力、拡張のボタン（<browser-action-list>）
const $ = (id) => document.getElementById(id)
$('a').onclick = () => window.spike.selectTab('a')
$('b').onclick = () => window.spike.selectTab('b')
$('go').onsubmit = (e) => {
  e.preventDefault()
  window.spike.navigate($('url').value.trim())
}

let shownPartition
window.spike.onState(({ active, partition, url }) => {
  for (const id of ['a', 'b']) $(id).setAttribute('aria-pressed', String(id === active))
  if (document.activeElement !== $('url')) $('url').value = url
  // 表示中のタブのセッションの拡張を出すため、タブが変わったら作り直す
  if (partition !== shownPartition) {
    shownPartition = partition
    const list = document.createElement('browser-action-list')
    list.setAttribute('partition', partition)
    list.setAttribute('alignment', 'bottom right')
    $('actions').replaceChildren(list)
  }
})
