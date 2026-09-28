// 三ペインの入れ物だけ。中身は M2 以降で入れる。
// 中央の <main> には、のちにページの WebContentsView を重ねる（位置と大きさを IPC で Main に報告する）
function App(): React.JSX.Element {
  return (
    <div className="app-shell">
      <header className="top-bar" />
      <nav className="left-panel" />
      <main className="content" />
    </div>
  )
}

export default App
