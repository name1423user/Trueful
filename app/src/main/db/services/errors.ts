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
export function isCorruptionError(e: unknown): boolean {
  const code = (e as { errcode?: unknown } | null)?.errcode
  return typeof code === 'number' && [11, 26].includes(code & 0xff)
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
