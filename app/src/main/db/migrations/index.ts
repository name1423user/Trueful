import type { Migration } from '../services/migrate'
import { migration0001 } from './0001_initial'

// 版ごとのマイグレーション。番号は 1 から連続させ、一度マージしたものは書き換えない
export const migrations: readonly Migration[] = [migration0001]
