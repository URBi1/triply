import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dir, '../../../triply.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema on first run
const schema = readFileSync(join(__dir, 'schema.sql'), 'utf8');
db.exec(schema);

// pg-compatible query interface: query(sql, params) → { rows }
export function query(sql, params = []) {
  const stmt = db.prepare(sql);
  const isSelect = sql.trimStart().toUpperCase().startsWith('SELECT') ||
                   sql.trimStart().toUpperCase().startsWith('WITH');
  if (isSelect) {
    return { rows: stmt.all(...params) };
  }
  const info = stmt.run(...params);
  // For INSERT ... RETURNING — SQLite doesn't support RETURNING in older versions,
  // so we use lastInsertRowid to fetch the row back
  return { rows: [], info };
}

// SQLite-compatible query with RETURNING simulation
export function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(...params);
}

export function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

export default db;
