import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { DatabaseTooNewError, MigrationError } from './errors'
import { getVersion, migrate, type Migration } from './migrate'

const tables = (db: DatabaseSync): string[] =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => String(r['name']))

const createTable = (version: number, name: string): Migration => ({
  version,
  up: (db) => db.exec(`CREATE TABLE ${name} (id INTEGER PRIMARY KEY) STRICT`)
})

describe('migrate', () => {
  it('空の DB に番号順に適用し、版を user_version に記録する', () => {
    const db = new DatabaseSync(':memory:')
    expect(getVersion(db)).toBe(0)
    expect(migrate(db, [createTable(1, 'a'), createTable(2, 'b')])).toBe(2)
    expect(getVersion(db)).toBe(2)
    expect(tables(db)).toEqual(['a', 'b'])
  })

  it('適用済みの版は、もう一度は適用しない', () => {
    const db = new DatabaseSync(':memory:')
    let calls = 0
    const counted: Migration = { version: 1, up: () => void calls++ }
    migrate(db, [counted])
    migrate(db, [counted])
    expect(calls).toBe(1)
  })

  it('途中で失敗した版は、その版の変更をすべて取り消し、前の版のまま残す', () => {
    const db = new DatabaseSync(':memory:')
    const broken: Migration = {
      version: 2,
      up: (d) => {
        d.exec('CREATE TABLE half (id INTEGER PRIMARY KEY) STRICT')
        d.exec('THIS IS NOT SQL')
      }
    }
    expect(() => migrate(db, [createTable(1, 'a'), broken])).toThrow(MigrationError)
    expect(getVersion(db)).toBe(1)
    expect(tables(db)).toEqual(['a'])
  })

  it('up() の中でトランザクションを終えたら、版を上げずに MigrationError にする', () => {
    const db = new DatabaseSync(':memory:')
    const commits: Migration = { version: 1, up: (d) => d.exec('COMMIT') }
    expect(() => migrate(db, [commits])).toThrow(MigrationError)
    expect(getVersion(db)).toBe(0)
    expect(db.isTransaction).toBe(false)
  })

  it('トランザクションがすでに取り消されていても、元のエラーを cause にして MigrationError にする', () => {
    const db = new DatabaseSync(':memory:')
    const original = new Error('元のエラー')
    const rolledBack: Migration = {
      version: 1,
      up: (d) => {
        d.exec('ROLLBACK')
        throw original
      }
    }
    expect(() => migrate(db, [rolledBack])).toThrow(expect.objectContaining({ cause: original }))
    expect(getVersion(db)).toBe(0)
  })

  it('DB の版がアプリより新しいときは、DB に触らずにエラーにする', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA user_version = 5')
    expect(() => migrate(db, [createTable(1, 'a')])).toThrow(DatabaseTooNewError)
    expect(getVersion(db)).toBe(5)
    expect(tables(db)).toEqual([])
  })

  it('番号が 1 から連続していないマイグレーションの一覧は受け付けない', () => {
    const db = new DatabaseSync(':memory:')
    expect(() => migrate(db, [createTable(2, 'a')])).toThrow('連続していない')
    expect(getVersion(db)).toBe(0)
  })
})
