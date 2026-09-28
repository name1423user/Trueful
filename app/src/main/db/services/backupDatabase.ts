import { rmSync, renameSync } from 'node:fs'
import { backup, type DatabaseSync } from 'node:sqlite'
import { DatabaseBackupError } from './errors'

// DB 全体を bakPath に写す（1世代）。一時ファイルに写してから名前を変えるので、
// 途中で失敗しても、前のバックアップは壊れない（ADR-014 と同じ形）
export async function backupDatabase(db: DatabaseSync, bakPath: string): Promise<void> {
  const tmpPath = `${bakPath}.tmp`
  try {
    // 前回の失敗で残った一時ファイルがあると、backup() がその中身に上書きしてしまうので先に消す
    rmSync(tmpPath, { force: true })
    await backup(db, tmpPath)
    renameSync(tmpPath, bakPath)
  } catch (e) {
    rmSync(tmpPath, { force: true })
    throw new DatabaseBackupError(bakPath, { cause: e })
  }
}
