export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

/**
 * The minimal synchronous SQL surface db/ code is written against.
 *
 * expo-sqlite's SQLiteDatabase is adapted to this shape in connection.ts
 * for the real app; better-sqlite3 is adapted to the same shape in
 * db/__tests__/testDatabase.ts, so schema.ts, repo.ts, and
 * services/ledger.ts all run under plain Node with no emulator — the same
 * property plan 1 established for core/, one layer up.
 */
export interface SqlDatabase {
  execSync(sql: string): void;
  getAllSync<T>(sql: string, params?: readonly unknown[]): T[];
  runSync(sql: string, params?: readonly unknown[]): SqlRunResult;
}
