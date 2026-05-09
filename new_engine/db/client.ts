// ============================================================
// TreatNote V2 — SQLite Client
// ============================================================

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '..', 'treatnote_v2.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

let _db: Database.Database | null = null;

/** Singleton SQLite connection */
export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    // Apply schema
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    _db.exec(schema);
  }
  return _db;
}

/** Close DB (cleanup) */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ---- Generic helpers ----

export function insertRow(table: string, data: Record<string, unknown>): void {
  const db = getDb();
  const keys = Object.keys(data);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  db.prepare(sql).run(...keys.map(k => data[k]));
}

export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): Database.RunResult {
  return getDb().prepare(sql).run(...params);
}
