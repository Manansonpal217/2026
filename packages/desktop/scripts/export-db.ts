#!/usr/bin/env npx tsx
/**
 * Export the encrypted local.db to a plain SQLite file for inspection in DBGate etc.
 *
 * Usage (close the app first):
 *   DB_ENCRYPTION_KEY="<key>" npx tsx scripts/export-db.ts
 *
 * Get the key: security find-generic-password -s "tracksync" -a "db-key" -w
 *
 * Output: local_export.db in the desktop package directory
 */
import Database from 'better-sqlite3-multiple-ciphers'
import { join } from 'path'
import { homedir } from 'os'
import { unlinkSync, existsSync } from 'fs'

const key = process.env.DB_ENCRYPTION_KEY
if (!key) {
  console.error('Set DB_ENCRYPTION_KEY. Get it with:')
  console.error('  security find-generic-password -s "tracksync" -a "db-key" -w')
  process.exit(1)
}

const dbPath =
  process.env.DB_PATH ||
  join(homedir(), 'Library', 'Application Support', 'desktop', 'local.db')

const outPath = join(__dirname, '..', 'local_export.db')

console.log('Opening:', dbPath)
const src = new Database(dbPath, { readonly: true })
src.pragma(`key = '${key}'`)

// Verify we can read
try {
  src.prepare('SELECT 1').get()
} catch (e) {
  console.error('Failed to open database. Wrong key or file is locked (close the app first).', e)
  src.close()
  process.exit(1)
}

console.log('Creating plain export:', outPath)

if (existsSync(outPath)) unlinkSync(outPath)

const tables = src.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]

const dest = new Database(outPath)
dest.pragma('journal_mode = DELETE')

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

for (const { name } of tables) {
  const info = src.pragma(`table_info("${name.replace(/"/g, '""')}")`) as { name: string; type: string }[]
  const cols = info.map((c) => quote(c.name)).join(', ')
  const create = src.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(name) as { sql: string }
  if (create?.sql) dest.exec(create.sql)
  const rows = src.prepare(`SELECT * FROM ${quote(name)}`).all()
  if (rows.length > 0) {
    const placeholders = info.map(() => '?').join(', ')
    const insert = dest.prepare(`INSERT INTO ${quote(name)} (${cols}) VALUES (${placeholders})`)
    for (const row of rows as Record<string, unknown>[]) {
      insert.run(...info.map((c) => row[c.name]))
    }
  }
}

src.close()
dest.close()

console.log('Done. Open local_export.db in DBGate (no encryption).')
