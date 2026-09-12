import { openDatabase } from '../db/connection';
import { runMigrations } from '../db/schema';
import type { SqlDatabase } from '../db/sqlDatabase';

/**
 * Opens the on-device database and brings its schema up to date. Called once
 * at app launch from the root layout. Native (expo-sqlite via connection.ts),
 * so it has no automated test and is verified manually; runMigrations itself
 * is covered by plan 2's schema tests against better-sqlite3.
 */
export function initializeDatabase(): SqlDatabase {
  const db = openDatabase('fifo.db');
  runMigrations(db);
  return db;
}
