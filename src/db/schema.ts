import type { SqlDatabase } from './sqlDatabase';

export const CURRENT_SCHEMA_VERSION = 2;

/**
 * One entry per schema version, keyed by the version it produces. Applied
 * in order from the database's current PRAGMA user_version up to
 * CURRENT_SCHEMA_VERSION — SQLite reserves user_version for exactly this,
 * so no separate bookkeeping table is needed.
 *
 * Constraint for future migrations: `runMigrations` below wraps every
 * migration in a single BEGIN/COMMIT. That's fine for straightforward
 * CREATE/ALTER-add-column migrations like v1, but SQLite's standard recipe
 * for restructuring a table with foreign keys (e.g. changing a column's
 * type, dropping a column, changing a NOT NULL/DEFAULT) requires running
 * `PRAGMA foreign_keys=OFF` *outside* any transaction — the pragma is a
 * silent no-op if issued inside one — before the
 * create-new-table/copy-rows/drop-old/rename sequence, then turning it back
 * on afterward. A future migration that needs that recipe cannot run through
 * this single-BEGIN wrapper as written; it will need `runMigrations` (or a
 * dedicated path for that migration) to issue `PRAGMA foreign_keys=OFF`
 * before opening the transaction.
 */
const MIGRATIONS: Record<number, string> = {
  2: `CREATE TABLE evidence_storage (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), directory TEXT NOT NULL);
      INSERT INTO evidence_storage (singleton, directory) VALUES (1, 'evidence');`,
  1: `
    CREATE TABLE symbols (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      name   TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE lots (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol_id       INTEGER NOT NULL REFERENCES symbols(id),
      buy_date        TEXT    NOT NULL,
      price_usd       TEXT    NOT NULL,
      qty             TEXT    NOT NULL,
      fx_rate_usd_thb TEXT    NOT NULL,
      created_at      TEXT    NOT NULL,
      evidence_file   TEXT
    );
    CREATE INDEX lots_fifo ON lots(symbol_id, buy_date, created_at, id);

    CREATE TABLE sales (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol_id       INTEGER NOT NULL REFERENCES symbols(id),
      sell_date       TEXT    NOT NULL,
      qty_sold        TEXT    NOT NULL,
      sale_price_usd  TEXT    NOT NULL,
      fee_usd         TEXT    NOT NULL DEFAULT '0.0000',
      fx_rate_usd_thb TEXT    NOT NULL,
      created_at      TEXT    NOT NULL,
      evidence_file   TEXT
    );
    CREATE INDEX sales_fifo ON sales(symbol_id, sell_date, created_at, id);

    CREATE TABLE sale_allocations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id        INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      lot_id         INTEGER NOT NULL REFERENCES lots(id)  ON DELETE CASCADE,
      qty_allocated  TEXT    NOT NULL,
      cost_basis_thb TEXT    NOT NULL
    );

    CREATE TABLE fx_rates (
      rate_date  TEXT PRIMARY KEY,
      usd_thb    TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE quotes (
      ticker     TEXT PRIMARY KEY,
      price_usd  TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `,
};

export function runMigrations(db: SqlDatabase): void {
  const [row] = db.getAllSync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = row!.user_version;

  if (currentVersion >= CURRENT_SCHEMA_VERSION) return;

  db.execSync('BEGIN;');
  try {
    for (let version = currentVersion + 1; version <= CURRENT_SCHEMA_VERSION; version++) {
      const migration = MIGRATIONS[version];
      if (!migration) {
        throw new Error(`No migration registered for schema version ${version}`);
      }
      db.execSync(migration);
    }
    db.execSync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};`);
    db.execSync('COMMIT;');
  } catch (error) {
    db.execSync('ROLLBACK;');
    throw error;
  }
}
