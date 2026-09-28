import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { migrate } from '../services/migrate'
import { migrations } from '.'

// data-schema.md の「最新のスキーマ」の SQL を取り出す。Windows のチェックアウトでは改行が CRLF になる
function latestSchemaSql(): string {
  const md = readFileSync(
    new URL('../../../../../docs-ja/architecture/data-schema.md', import.meta.url),
    'utf8'
  ).replace(/\r\n/g, '\n')
  const sql = md.match(/<!-- latest-schema -->\n```sql\n([\s\S]*?)```/)?.[1]
  if (!sql) throw new Error('data-schema.md に <!-- latest-schema --> の SQL がない')
  return sql
}

// DB の構造（テーブル・索引・トリガーと、その定義・列）を、比べられる形にする
function structureOf(db: DatabaseSync): unknown[] {
  return db
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
    )
    .all()
    .map((o) => ({
      type: o['type'],
      name: o['name'],
      table: o['tbl_name'],
      // 1つの定義の中の空白の違いだけを無視する（定義が1つ消えれば、名前の一覧で分かる）
      sql: String(o['sql'] ?? '').replace(/\s+/g, ' '),
      columns:
        o['type'] === 'table' ? db.prepare(`PRAGMA table_xinfo("${o['name']}")`).all() : undefined
    }))
}

describe('スキーマ', () => {
  it('すべてのマイグレーションを適用した結果が、data-schema.md の最新のスキーマと一致する', () => {
    const migrated = new DatabaseSync(':memory:')
    migrate(migrated, migrations)
    const documented = new DatabaseSync(':memory:')
    documented.exec(latestSchemaSql())
    expect(structureOf(migrated)).toEqual(structureOf(documented))
  })
})
