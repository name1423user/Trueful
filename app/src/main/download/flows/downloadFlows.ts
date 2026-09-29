import { lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { sep } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { getWorkspace } from '../../workspace/services/workspaceDB'
import {
  finishDownload,
  insertDownload,
  listDownloads,
  updateDownload
} from '../services/downloadDB'
import { downloadDir, sanitizeFileName, uniquePath } from '../services/downloadPath'

// Electron の DownloadItem のうち、使うものだけ（テストで差し替えられるように）
export type DownloadItemLike = {
  getFilename(): string
  getURL(): string
  getReceivedBytes(): number
  getTotalBytes(): number
  setSavePath(path: string): void
  pause(): void
  resume(): void
  cancel(): void
  isPaused(): boolean
  canResume(): boolean
  on(
    event: 'updated',
    listener: (event: unknown, state: 'progressing' | 'interrupted') => void
  ): unknown
  once(
    event: 'done',
    listener: (event: unknown, state: 'completed' | 'cancelled' | 'interrupted') => void
  ): unknown
}

// 存在の確認。壊れたシンボリックリンクも「ある」と数える（existsSync は、リンクの先がないと false を返す）
function lexists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

// 進み具合を DB に書く間隔（ミリ秒）。届くたびに書くと多すぎる
const WRITE_INTERVAL_MS = 500

// ダウンロードの進行役（F07）。ページの will-download を受け、Workspace のフォルダに保存し、記録し、
// 一時停止・再開・取り消し・フォルダで表示を受ける。再開はアプリを起動している間だけ
// （動いているものは items に持つ。再起動した後の行は interrupted で、操作できない）
export class DownloadFlows {
  private readonly items = new Map<number, DownloadItemLike>()
  // 選んだ保存先。ファイルがまだできていなくても、同時に別のダウンロードが同じ名前を選ばないための予約
  private readonly reserved = new Set<string>()

  constructor(
    private readonly deps: {
      getDb: () => DatabaseSync | undefined
      downloadsDir: string
      notifyChanged: () => void
      showItemInFolder: (path: string) => void
      now?: () => number
    }
  ) {}

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  // ページが始めたダウンロードを受ける。受けられないとき（DB・Workspace がない、フォルダを作れない）は取り消す
  handle(workspaceId: number, item: DownloadItemLike): void {
    const db = this.deps.getDb()
    const workspace = db?.isOpen ? getWorkspace(db, workspaceId) : undefined
    if (!db || !workspace) return item.cancel()
    let path: string
    try {
      const dir = downloadDir(this.deps.downloadsDir, workspace.name)
      mkdirSync(dir, { recursive: true })
      // フォルダが、ダウンロードのフォルダの外へのリンクなら使わない（リンクの先へ書かせない）
      const root = realpathSync(this.deps.downloadsDir)
      if (!(realpathSync(dir) + sep).startsWith(root + sep))
        throw new Error('保存先がフォルダの外を指している')
      path = uniquePath(
        dir,
        sanitizeFileName(item.getFilename()),
        (p) => lexists(p) || this.reserved.has(p)
      )
    } catch (e) {
      console.error('[main] ダウンロードの保存先を用意できなかった', e)
      return item.cancel()
    }
    this.reserved.add(path)
    const total = item.getTotalBytes()
    let id: number
    try {
      id = insertDownload(
        db,
        { workspaceId, url: item.getURL(), path, totalBytes: total > 0 ? total : null },
        this.now()
      )
      item.setSavePath(path)
    } catch (e) {
      // 記録できなかったら、記録のないファイルを残さない
      console.error('[main] ダウンロードを記録できなかった', e)
      this.reserved.delete(path)
      return item.cancel()
    }
    this.items.set(id, item)
    let lastWrite = this.now()
    item.on('updated', (_e, state) => {
      if (!db.isOpen) return
      // ネットワークが切れた。再開できるなら一時停止として見せる（再開を押せる）。できないときは done を待つ
      if (state === 'interrupted') {
        if (item.canResume()) {
          updateDownload(db, id, { state: 'paused' })
          this.deps.notifyChanged()
        }
        return
      }
      const now = this.now()
      if (now - lastWrite < WRITE_INTERVAL_MS) return
      lastWrite = now
      updateDownload(db, id, { receivedBytes: item.getReceivedBytes() })
      this.deps.notifyChanged()
    })
    item.once('done', (_e, state) => {
      this.items.delete(id)
      this.reserved.delete(path)
      if (!db.isOpen) return
      updateDownload(db, id, { receivedBytes: item.getReceivedBytes() })
      finishDownload(db, id, state, this.now())
      this.deps.notifyChanged()
    })
    this.deps.notifyChanged()
  }

  // 一時停止・再開・取り消しは、動いているダウンロードだけ。できたら true
  pause(id: number): boolean {
    return this.control(id, (item, db) => {
      item.pause()
      updateDownload(db, id, { state: 'paused' })
      return true
    })
  }

  resume(id: number): boolean {
    return this.control(id, (item, db) => {
      if (!item.canResume()) return false
      item.resume()
      updateDownload(db, id, { state: 'in_progress' })
      return true
    })
  }

  // 取り消す。記録は、Electron の done の知らせで cancelled になる
  cancel(id: number): boolean {
    return this.control(id, (item) => {
      item.cancel()
      return true
    })
  }

  private control(id: number, run: (item: DownloadItemLike, db: DatabaseSync) => boolean): boolean {
    const item = this.items.get(id)
    const db = this.deps.getDb()
    if (!item || !db?.isOpen) return false
    const ok = run(item, db)
    if (ok) this.deps.notifyChanged()
    return ok
  }

  // 終了のとき、動いているダウンロードをすべて取り消す（DB を閉じる前に呼ぶ。記録が in_progress のまま残らない）
  dispose(): void {
    for (const item of [...this.items.values()]) item.cancel()
  }

  // 保存したファイルを、フォルダで表示する（記録にある保存先だけ。任意のパスは受けない）
  showInFolder(id: number): boolean {
    const db = this.deps.getDb()
    const row = db?.isOpen ? listDownloads(db).find((d) => d.id === id) : undefined
    if (!row || !lexists(row.path)) return false // 記録はあっても、ファイルが消えていたら false
    this.deps.showItemInFolder(row.path)
    return true
  }
}
