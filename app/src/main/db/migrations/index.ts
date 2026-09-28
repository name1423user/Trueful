import type { Migration } from '../services/migrate'

// 版ごとのマイグレーション。番号は 1 から連続させ、一度マージしたものは書き換えない
// （版1のスキーマは T1-3-2 で足す）
export const migrations: readonly Migration[] = []
