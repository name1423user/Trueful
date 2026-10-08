// DB の失敗を、呼び出し元が種類で見分けられるようにする（ADR-014 と同じく、元のエラーを cause に残す）

export class DatabaseCorruptedError extends Error {
  constructor(
    readonly path: string,
    options?: { cause: unknown }
  ) {
    super(`DB が壊れている: ${path}`, options)
    this.name = 'DatabaseCorruptedError'
  }
}

// SQLite が「壊れている」と返したエラーか（SQLITE_CORRUPT = 11、SQLITE_NOTADB = 26。下位8ビットが基本のコード）
// 包まれたエラー（マイグレーション・バックアップの失敗）の原因（cause）もたどる
export function isCorruptionError(e: unknown): boolean {
  for (let cur = e, depth = 0; cur && depth < 5; depth++) {
    const code = (cur as { errcode?: unknown }).errcode
    if (typeof code === 'number' && [11, 26].includes(code & 0xff)) return true
    cur = (cur as { cause?: unknown }).cause
  }
  return false
}

export class DatabaseTooNewError extends Error {
  constructor(
    readonly dbVersion: number,
    readonly appVersion: number
  ) {
    super(`DB の版（${dbVersion}）が、このアプリの版（${appVersion}）より新しい`)
    this.name = 'DatabaseTooNewError'
  }
}

export class MigrationError extends Error {
  constructor(
    readonly version: number,
    options: { cause: unknown }
  ) {
    super(`マイグレーション ${version} に失敗した`, options)
    this.name = 'MigrationError'
  }
}

export class DatabaseBackupError extends Error {
  constructor(
    readonly path: string,
    options: { cause: unknown }
  ) {
    super(`DB のバックアップに失敗した: ${path}`, options)
    this.name = 'DatabaseBackupError'
  }
}
