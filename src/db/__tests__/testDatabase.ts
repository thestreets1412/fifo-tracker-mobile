import Database from 'better-sqlite3';
import type { SqlDatabase, SqlRunResult } from '../sqlDatabase';

/**
 * A SqlDatabase backed by better-sqlite3 instead of expo-sqlite, so
 * schema.ts, repo.ts, and services/ledger.ts run under plain Node with no
 * emulator. Lives under __tests__/ so better-sqlite3 (a devDependency) is
 * never reachable from the app's own import graph.
 */
export function openTestDatabase(): SqlDatabase {
  const native = new Database(':memory:');

  const db: SqlDatabase = {
    execSync(sql: string) {
      native.exec(sql);
    },
    getAllSync<T>(sql: string, params: readonly unknown[] = []) {
      return native.prepare(sql).all(...params) as T[];
    },
    runSync(sql: string, params: readonly unknown[] = []): SqlRunResult {
      const result = native.prepare(sql).run(...params);
      return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
    },
  };

  db.execSync('PRAGMA foreign_keys = ON;');
  return db;
}
