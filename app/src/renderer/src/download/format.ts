// ダウンロードの表示の部品（F07）
type State = 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'interrupted'

// 大きさを、1024 区切りで読みやすくする（B は整数、KB 以上は小数 1 桁）
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return i === 0 ? `${bytes} B` : `${value.toFixed(1)} ${units[i]}`
}

// 進み具合（0〜100 の整数）。大きさが分からないときは undefined
export function progressPercent(received: number, total: number | null): number | undefined {
  if (total === null || total <= 0) return undefined
  return Math.min(100, Math.floor((received / total) * 100))
}

// 状態ごとにできる操作。動いているものだけ、止める・再開・取り消しができる（再起動で中断したものは、操作できない）
export function availableActions(state: State): {
  pause: boolean
  resume: boolean
  cancel: boolean
  show: boolean
} {
  return {
    pause: state === 'in_progress',
    resume: state === 'paused',
    cancel: state === 'in_progress' || state === 'paused',
    show: state === 'completed'
  }
}

// 保存先のパスから、ファイル名だけを取り出す
export function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}
