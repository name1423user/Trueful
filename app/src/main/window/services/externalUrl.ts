// UI から開こうとしたリンクのうち、既定のブラウザに渡してよいものか（http・https だけ）
export function isExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
