// 名前の最初の1文字（英字は大文字）。サロゲートペアの文字も1文字として扱う
export function initial(name: string): string {
  return (Array.from(name)[0] ?? '').toUpperCase()
}
