import * as SQLite from 'expo-sqlite';
import type { SqlDatabase, SqlRunResult } from './sqlDatabase';

/**
 * Opens the app's on-device database, wrapped in the SqlDatabase interface
 * so schema.ts, repo.ts, and services/ never import expo-sqlite directly.
 *
 * expo-sqlite defaults PRAGMA foreign_keys to OFF on every new connection,
 * and SQLite does not persist that pragma across connections, so it is set
 * here rather than trusted to a schema-file statement.
 *
 * This file has no automated test: expo-sqlite is a native module and
 * cannot run under plain Node. It is thin glue over a library API, and is
 * verified manually on a physical device once the app shell exists
 * (plan 3), matching the design spec's own testing strategy (§10:
 * "Screens — manual verification on a physical device").
 */
export function openDatabase(name: string): SqlDatabase {
  const native = SQLite.openDatabaseSync(name);

  const db: SqlDatabase = {
    execSync(sql: string) {
      native.execSync(sql);
    },
    getAllSync<T>(sql: string, params: readonly unknown[] = []) {
      return native.getAllSync<T>(sql, params as SQLite.SQLiteBindParams);
    },
    runSync(sql: string, params: readonly unknown[] = []): SqlRunResult {
      const result = native.runSync(sql, params as SQLite.SQLiteBindParams);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
  };

  db.execSync('PRAGMA foreign_keys = ON;');
  return db;
}
