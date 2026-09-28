import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../services/migrate'
import { SCHEMA_V1 } from './0001_initial'
import { migrations } from '.'

let db: DatabaseSync
const run = (sql: string, ...args: (string | number | null)[]): void => {
  db.prepare(sql).run(...args)
}
const count = (sql: string, ...args: string[]): number =>
  Number(db.prepare(sql).get(...args)?.['n'])
const now = 1_700_000_000_000
const addWorkspace = (name = 'A'): void =>
  run(
    "INSERT INTO workspace (name, mode, position, last_used_time_ms, created_time_ms) VALUES (?, 'development', 0, ?, ?)",
    name,
    now,
    now
  )

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, migrations)
})

describe('版1のスキーマ', () => {
  it('data-schema.md の SQL と同じ中身である（文書とコードのずれを見つける）', () => {
    const md = readFileSync(
      new URL('../../../../../docs-ja/architecture/data-schema.md', import.meta.url),
      'utf8'
    )
    const docSql = md.match(/```sql\n([\s\S]*?)```/)?.[1]
    const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim()
    expect(docSql).toBeDefined()
    expect(normalize(SCHEMA_V1)).toBe(normalize(docSql ?? ''))
  })

  it('すべてのテーブルを作り、app_state に1行入れる', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '%fts%' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((r) => r['name'])
    expect(tables).toEqual([
      'app_state',
      'bookmark',
      'download',
      'extension_scope',
      'extension_scope_workspace',
      'history_url',
      'history_visit',
      'site_permission',
      'tab',
      'workspace',
      'workspace_manifest_backup',
      'workspace_snapshot'
    ])
    expect(count('SELECT count(*) n FROM app_state')).toBe(1)
    expect(db.prepare('PRAGMA user_version').get()?.['user_version']).toBe(1)
  })

  it('workspace の状態の列が ADR-012 の定義と一致する', () => {
    const cols = Object.fromEntries(
      db
        .prepare('PRAGMA table_info(workspace)')
        .all()
        .map((c) => [c['name'], { type: c['type'], notnull: c['notnull'], dflt: c['dflt_value'] }])
    )
    expect(cols['status']).toEqual({ type: 'TEXT', notnull: 1, dflt: "'active'" })
    expect(cols['last_used_time_ms']).toEqual({ type: 'INTEGER', notnull: 1, dflt: null })
    expect(cols['dormanted_time_ms']).toEqual({ type: 'INTEGER', notnull: 0, dflt: null })
  })

  it('不正な値を拒否する', () => {
    addWorkspace()
    const rejects = [
      // dormant なのに時刻がない（ADR-012）
      "INSERT INTO workspace (name, mode, status, position, last_used_time_ms, created_time_ms) VALUES ('B', 'custom', 'dormant', 1, 0, 0)",
      "INSERT INTO workspace (name, mode, position, last_used_time_ms, created_time_ms) VALUES ('B', 'prod', 1, 0, 0)",
      "INSERT INTO workspace (name, mode, position, last_used_time_ms, created_time_ms) VALUES ('  ', 'custom', 1, 0, 0)",
      "INSERT INTO tab (workspace_id, url, position, last_active_time_ms) VALUES (99, 'https://x', 0, 0)",
      "INSERT INTO site_permission VALUES (1, 'https://x', 'media', 'allow', 0)",
      'INSERT INTO app_state (id) VALUES (2)',
      "INSERT INTO bookmark (kind, title, url, position, created_time_ms) VALUES ('folder', 'F', 'https://x', 0, 0)"
    ]
    for (const sql of rejects) expect(() => run(sql), sql).toThrow()
  })

  it('ブックマークの親はフォルダだけで、種類は変えられない', () => {
    run(
      "INSERT INTO bookmark (kind, title, position, created_time_ms) VALUES ('folder', 'Bar', 0, 0)"
    )
    run(
      "INSERT INTO bookmark (parent_id, kind, title, url, position, created_time_ms) VALUES (1, 'url', 'MDN', 'https://developer.mozilla.org', 0, 0)"
    )
    expect(() =>
      run(
        "INSERT INTO bookmark (parent_id, kind, title, url, position, created_time_ms) VALUES (2, 'url', 'x', 'https://x', 0, 0)"
      )
    ).toThrow('parent must be a folder')
    expect(() => run("UPDATE bookmark SET kind = 'folder', url = NULL WHERE id = 2")).toThrow(
      'kind cannot change'
    )
  })

  it('全文検索の索引が、追加・変更・削除に追従する', () => {
    addWorkspace()
    run(
      "INSERT INTO history_url (workspace_id, url, title, last_visited_time_ms) VALUES (1, 'https://react.dev/learn', 'React を学ぶ', 0)"
    )
    const hits = (q: string): number =>
      count('SELECT count(*) n FROM history_url_fts WHERE history_url_fts MATCH ?', q)
    expect(hits('"を学ぶ"')).toBe(1)
    run("UPDATE history_url SET title = 'Learn React' WHERE id = 1")
    expect(hits('"を学ぶ"')).toBe(0)
    expect(hits('"Learn"')).toBe(1)
    run('DELETE FROM history_url WHERE id = 1')
    expect(hits('"Learn"')).toBe(0)
  })

  it('Workspace を消すと、その Workspace の行がまとめて消え、id は使い回さない', () => {
    addWorkspace()
    run('UPDATE app_state SET last_workspace_id = 1')
    run(
      "INSERT INTO tab (workspace_id, url, position, last_active_time_ms) VALUES (1, 'https://a', 0, 0)"
    )
    run(
      "INSERT INTO history_url (workspace_id, url, last_visited_time_ms) VALUES (1, 'https://a', 0)"
    )
    run('INSERT INTO history_visit (url_id, visited_time_ms) VALUES (1, 0)')
    run(
      "INSERT INTO download (workspace_id, url, path, state, started_time_ms) VALUES (1, 'https://a/x.zip', '/tmp/x.zip', 'completed', 0)"
    )
    run("INSERT INTO extension_scope VALUES ('ext', 'selected')")
    run("INSERT INTO extension_scope_workspace VALUES ('ext', 1)")
    run("INSERT INTO site_permission VALUES (1, 'https://a', 'camera', 'allow', 0)")
    run("INSERT INTO workspace_manifest_backup VALUES (1, '{}', ?, 0)", 'a'.repeat(64))

    run('DELETE FROM workspace WHERE id = 1')
    for (const t of [
      'tab',
      'history_url',
      'history_visit',
      'download',
      'extension_scope_workspace',
      'site_permission',
      'workspace_manifest_backup'
    ]) {
      expect(count(`SELECT count(*) n FROM ${t}`), t).toBe(0)
    }
    expect(count('SELECT count(*) n FROM extension_scope')).toBe(1)
    expect(db.prepare('SELECT last_workspace_id v FROM app_state').get()?.['v']).toBeNull()

    addWorkspace('B')
    expect(db.prepare("SELECT id FROM workspace WHERE name = 'B'").get()?.['id']).toBe(2)
  })
})
