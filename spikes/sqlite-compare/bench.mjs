// T1-3a: better-sqlite3 と node:sqlite を同じ手順で測る。Electron の Main（main.mjs）からも、素の Node からも呼べる。
// 素の Node で試すとき: node bench.mjs --label=node
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

const ROWS = 10_000
const LOOKUPS = 1_000
const LIKE_QUERIES = 100
const RUNS = 5

const warnings = []
process.on('warning', (w) => warnings.push(`${w.name}: ${w.message}`))

// 2つの実装を同じ形（exec・prepare・close）で扱う。どちらも prepare の戻り値に run・get・all がある
async function loadNodeSqlite() {
  const { DatabaseSync } = await import('node:sqlite')
  return { open: (path) => new DatabaseSync(path) }
}
function loadBetterSqlite3() {
  const Database = createRequire(import.meta.url)('better-sqlite3')
  return { open: (path) => new Database(path) }
}

function benchOnce(impl, dir, run) {
  const path = join(dir, `run-${run}.db`)
  const db = impl.open(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
  db.exec(`CREATE TABLE history (
    id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, url TEXT NOT NULL,
    title TEXT NOT NULL, visited_time_ms INTEGER NOT NULL);
    CREATE INDEX idx_history_url ON history(url);
    CREATE INDEX idx_history_ws_time ON history(workspace_id, visited_time_ms);`)

  const insert = db.prepare(
    'INSERT INTO history (workspace_id, url, title, visited_time_ms) VALUES (?, ?, ?, ?)'
  )
  let t = performance.now()
  db.exec('BEGIN')
  for (let i = 0; i < ROWS; i++) {
    insert.run(i % 8, `https://example.com/page/${i}`, `ページ ${i} の題名`, 1_700_000_000_000 + i)
  }
  db.exec('COMMIT')
  const insertMs = performance.now() - t

  const byUrl = db.prepare('SELECT id, title FROM history WHERE url = ?')
  t = performance.now()
  let found = 0
  for (let i = 0; i < LOOKUPS; i++) {
    if (byUrl.get(`https://example.com/page/${(i * 7919) % ROWS}`)) found++
  }
  const lookupMs = performance.now() - t

  const like = db.prepare('SELECT id FROM history WHERE title LIKE ? LIMIT 50')
  t = performance.now()
  let likeRows = 0
  for (let i = 0; i < LIKE_QUERIES; i++) likeRows += like.all(`%${(i * 37) % 1000}%`).length
  const likeMs = performance.now() - t

  const count = db.prepare('SELECT COUNT(*) AS n FROM history').get().n
  db.close()
  if (count !== ROWS || found !== LOOKUPS) throw new Error(`件数が合わない: ${count} / ${found}`)
  return { insertMs, lookupMs, likeMs, likeRows }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const round = (x) => Math.round(x * 100) / 100

async function measure(name, loader) {
  const result = { name, loaded: false }
  let impl
  try {
    impl = await loader()
    result.loaded = true
  } catch (e) {
    result.error = String(e?.message ?? e).split('\n')[0]
    return result
  }
  // Windows はフォルダ名に「:」を使えないので、名前から英数字以外を除く
  const dir = mkdtempSync(join(tmpdir(), `trueful-sqlite-${name.replace(/[^a-z0-9]/gi, '')}-`))
  try {
    const db = impl.open(':memory:')
    result.sqliteVersion = db.prepare('SELECT sqlite_version() AS v').get().v
    db.close()
    const runs = Array.from({ length: RUNS }, (_, i) => benchOnce(impl, dir, i))
    for (const key of ['insertMs', 'lookupMs', 'likeMs']) {
      result[key] = round(median(runs.map((r) => r[key])))
    }
  } catch (e) {
    result.error = String(e?.message ?? e)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return result
}

function summaryMarkdown(out) {
  const rows = out.results.map(
    (r) =>
      `| ${r.name} | ${r.loaded ? '◯' : '×'} | ${r.insertMs ?? '－'} | ${r.lookupMs ?? '－'} | ${r.likeMs ?? '－'} | ${r.sqliteVersion ?? '－'} | ${r.error ?? ''} |`
  )
  return [
    `### ${out.label}（${out.platform}-${out.arch}、Electron ${out.versions.electron ?? 'なし'}、Node ${out.versions.node}）`,
    '| 実装 | 読み込み | 挿入1万件 ms | 完全一致1,000回 ms | LIKE 100回 ms | SQLite | エラー |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    `警告: ${out.warnings.length ? out.warnings.join(' / ') : 'なし'}`,
    ''
  ].join('\n')
}

export async function runAll(label) {
  const out = {
    label,
    platform: process.platform,
    arch: process.arch,
    versions: { electron: process.versions.electron ?? null, node: process.versions.node },
    rows: ROWS,
    runs: RUNS,
    results: [await measure('node:sqlite', loadNodeSqlite), await measure('better-sqlite3', loadBetterSqlite3)]
  }
  // 'warning' は次のティックで届くので、少し待ってから書く
  await new Promise((r) => setTimeout(r, 100))
  out.warnings = warnings

  mkdirSync('results', { recursive: true })
  const file = join('results', `${label}-${process.platform}-${process.arch}.json`)
  writeFileSync(file, JSON.stringify(out, null, 2))
  console.log(`[spike] ${file}\n${summaryMarkdown(out)}`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(out))
  return out
}

export const labelFromArgv = (argv) => argv.find((a) => a.startsWith('--label='))?.slice(8) ?? 'local'

if (import.meta.url === pathToFileURL(process.argv[1]).href) await runAll(labelFromArgv(process.argv))
