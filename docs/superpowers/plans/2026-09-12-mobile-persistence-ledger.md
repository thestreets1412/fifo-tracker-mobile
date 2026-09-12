# Mobile Persistence and Ledger Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SQLite persistence layer (`src/db/`) and the ledger orchestration service (`src/services/ledger.ts`) for the standalone Android FIFO stock tracker, wiring the pure `src/core/` engine from plan 1 to a real on-device database, while keeping `src/db/` and `src/services/` fully testable under plain Node with no emulator.

**Architecture:** `src/db/sqlDatabase.ts` defines a small synchronous `SqlDatabase` interface (`execSync`/`getAllSync`/`runSync`). `src/db/connection.ts` adapts `expo-sqlite` to it for the real app; a parallel test-only adapter over `better-sqlite3` (`src/db/__tests__/testDatabase.ts`) satisfies the same interface under plain Node, so `schema.ts`, `repo.ts`, and `services/ledger.ts` are exercised with a real, fast, in-memory SQLite engine in every test — no mocks, no emulator. `schema.ts` owns DDL and `PRAGMA user_version`-keyed migrations. `repo.ts` is CRUD only: it converts between snake_case DB columns and camelCase row types, and never touches `decimal.js`. `services/ledger.ts` is the only place that converts between `core/`'s `Decimal` domain types and `repo.ts`'s string-typed rows, and the only place that calls `core/fifo.ts`'s `rebuildAllocations` — every mutation (`addLot`, `editLot`, `deleteLot`, `addSale`, `editSale`, `deleteSale`) runs inside one transaction that rebuilds every allocation from scratch and rolls back completely if the rebuild fails (spec §2.4, §4.4).

**Tech Stack:** `expo-sqlite` (production), `better-sqlite3` + `@types/better-sqlite3` (test-only devDependencies), the `decimal.js`/Jest/TypeScript toolchain from plan 1.

**Spec:** `D:\Python\fifo-tracker-mobile\docs\superpowers\specs\2026-09-12-mobile-standalone-design.md` (sections 2.2–2.4, 3.2, 7.4, 10 are load-bearing for this plan). Note for future readers: plan 1's own header pointed this line at the wrong repo (`stock-fifo-web-app`) — the spec has always lived in this repo, at the path above.

## Global Constraints

- **Project root:** `D:\Python\fifo-tracker-mobile`. Nothing in this plan writes to `D:\Python\stock-fifo-web-app`.
- **`PRAGMA foreign_keys = ON` on every connection** (CLAUDE.md) — `expo-sqlite` and `better-sqlite3` both default it OFF, and it does not persist across connections, so it is set explicitly by both `openDatabase()` and `openTestDatabase()`, never left to a schema-file statement.
- **SQLite columns holding money or quantities are `TEXT`, never `REAL`** (CLAUDE.md). Decimal places are fixed exactly as in plan 1: `price_usd` 6, `qty`/`qty_sold`/`qty_allocated` 8, `fx_rate_usd_thb` 4, `fee_usd`/`cost_basis_thb` 4 (`core/money.ts`'s `DP`).
- **Never `SUM()` a money or quantity column in SQL** (CLAUDE.md). `repo.ts` never issues an aggregate query over a TEXT column; any totals are computed by loading rows and using `core/derive.ts`.
- **`src/db/` and `src/services/` never import `decimal.js` values across the repo boundary as anything but strings.** `repo.ts`'s row types (`LotRow`, `SaleRow`, `AllocationRow`, and the shared `SymbolRow` from `core/types.ts`) hold only `string`/`number`/`null` fields. `services/ledger.ts` is the sole conversion boundary between those and `core/`'s `Decimal`-typed `Lot`/`Sale`/`Allocation`.
- **`src/core/` still imports nothing from `react`, `react-native`, `expo*`, or `src/db`** — unchanged from plan 1, and this plan's Task 8 hardens the automated check that enforces it (the check only caught static `from '...'` imports; `require()` and dynamic `import()` now matter since `src/db/` exists to import from).
- **Allocations are derived, never authoritative** (spec §2.4, CLAUDE.md). Every one of `addLot`/`editLot`/`deleteLot`/`addSale`/`editSale`/`deleteSale` calls `rebuildLedger()`, which clears `sale_allocations` and replays every sale via `core/fifo.ts`'s `rebuildAllocations`. If the rebuild throws (e.g. `InsufficientLotsError` because an edit made the ledger inconsistent), the whole mutation — including the insert/update/delete that triggered it — rolls back and existing data is left untouched (spec §4.4's safety net, applied to live mutations as well as import).
- **Migrations are keyed to a schema version** (CLAUDE.md architecture diagram: "schema.ts (DDL + migrations)"). This plan uses SQLite's built-in `PRAGMA user_version` as that version counter rather than a separate bookkeeping table — it is exactly what SQLite reserves this pragma for.
- **Tickers are normalized to uppercase with surrounding whitespace trimmed before the uniqueness check** (spec §7.4), so `nvda`, `NVDA`, and `NVDA ` resolve to one symbol. Deletion is refused while any lot or sale references the symbol (spec §7.4's `PROTECT`-equivalent behavior).
- **A lot's `created_at` is immutable once set** — it is the FIFO tiebreak timestamp (plan 1, `core/fifo.ts`'s `byLotOrder`/`bySaleOrder`); editing a lot or sale must never change it.
- **`db/` and `services/` are tested against a real SQLite engine (`better-sqlite3`), not a mock** — this plan reuses plan 1's principle (test the real thing, cheaply) one layer up, rather than introducing hand-written stubs of SQL behavior that could silently drift from what SQLite actually does.
- Node 24.18.0 and npm 11.16.0 are installed and confirmed on this machine (plan 1).

---

### Task 1: The SqlDatabase interface and two adapters

**Files:**
- Modify: `D:\Python\fifo-tracker-mobile\package.json`
- Create: `D:\Python\fifo-tracker-mobile\src\db\sqlDatabase.ts`
- Create: `D:\Python\fifo-tracker-mobile\src\db\connection.ts`
- Create: `D:\Python\fifo-tracker-mobile\src\db\__tests__\testDatabase.ts`
- Test: `D:\Python\fifo-tracker-mobile\src\db\__tests__\testDatabase.test.ts`

**Interfaces:**
- Consumes: nothing (first task of this plan)
- Produces:
  - `interface SqlRunResult { changes: number; lastInsertRowId: number }`
  - `interface SqlDatabase { execSync(sql: string): void; getAllSync<T>(sql: string, params?: readonly unknown[]): T[]; runSync(sql: string, params?: readonly unknown[]): SqlRunResult }`
  - `openDatabase(name: string): SqlDatabase` (production, wraps `expo-sqlite`)
  - `openTestDatabase(): SqlDatabase` (test-only, wraps `better-sqlite3`, lives under `__tests__/` so it is never reachable from the app's own import graph)

- [ ] **Step 1: Install dependencies**

```bash
cd /d/Python/fifo-tracker-mobile
npx expo install expo-sqlite
npm install --save-dev better-sqlite3 @types/better-sqlite3
```

`better-sqlite3` ships prebuilt binaries for common platforms via `prebuild-install`. If installation fails to fetch or build a binary for Node 24.18.0 on this machine, that is a real toolchain gap — stop and report it (status `BLOCKED`) rather than substituting a different in-memory SQL engine; the choice of `better-sqlite3` is load-bearing for every later task in this plan.

- [ ] **Step 2: Write the SqlDatabase interface**

Create `src/db/sqlDatabase.ts`:

```ts
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
```

- [ ] **Step 3: Write the production adapter**

Create `src/db/connection.ts`:

```ts
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
```

If the installed `expo-sqlite` version's method names or parameter types differ from `execSync`/`getAllSync`/`runSync` shown above (check `node_modules/expo-sqlite/build/*.d.ts` after Step 1's install), adapt only the bodies of the three methods above to match the real API — the exported `SqlDatabase` shape and every other file in this plan must not change.

- [ ] **Step 4: Write the test-only adapter**

Create `src/db/__tests__/testDatabase.ts`:

```ts
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
```

- [ ] **Step 5: Write the failing test**

Create `src/db/__tests__/testDatabase.test.ts`:

```ts
import { openTestDatabase } from './testDatabase';

describe('openTestDatabase', () => {
  it('enforces foreign keys', () => {
    const db = openTestDatabase();
    const rows = db.getAllSync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
    expect(rows[0]?.foreign_keys).toBe(1);
  });

  it('runs DDL, inserts, and reads rows back', () => {
    const db = openTestDatabase();
    db.execSync('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL);');

    const result = db.runSync('INSERT INTO t (name) VALUES (?);', ['a']);
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowId).toBe(1);

    const rows = db.getAllSync<{ id: number; name: string }>('SELECT * FROM t;');
    expect(rows).toEqual([{ id: 1, name: 'a' }]);
  });

  it('rejects a foreign key violation', () => {
    const db = openTestDatabase();
    db.execSync(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id));
    `);
    expect(() => db.runSync('INSERT INTO child (parent_id) VALUES (?);', [999])).toThrow();
  });

  it('gives each call a fresh, independent in-memory database', () => {
    const a = openTestDatabase();
    const b = openTestDatabase();
    a.execSync('CREATE TABLE t (id INTEGER PRIMARY KEY);');
    expect(() => b.getAllSync('SELECT * FROM t;')).toThrow();
  });
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- testDatabase`
Expected: PASS, 4 tests. (`connection.ts` is not covered by this run — see Step 3's note.)

- [ ] **Step 7: Commit**

```bash
cd /d/Python/fifo-tracker-mobile
node -e "const p=require('./package.json');console.log(JSON.stringify({...p.dependencies,...p.devDependencies},null,2))"
git add package.json package-lock.json src/db/sqlDatabase.ts src/db/connection.ts src/db/__tests__/testDatabase.ts src/db/__tests__/testDatabase.test.ts
git commit -m "feat: add SqlDatabase interface with expo-sqlite and better-sqlite3 adapters

db/, and everything built on it in this plan, runs under plain Node
against better-sqlite3 in tests and expo-sqlite on-device in production,
both behind the same synchronous SqlDatabase interface. Neither library
enables PRAGMA foreign_keys by default, and SQLite does not persist it
across connections, so both adapters set it explicitly on open."
```

---

### Task 2: Schema DDL and migrations

**Files:**
- Create: `D:\Python\fifo-tracker-mobile\src\db\schema.ts`
- Test: `D:\Python\fifo-tracker-mobile\src\db\__tests__\schema.test.ts`

**Interfaces:**
- Consumes: `SqlDatabase` from Task 1; `openTestDatabase` from Task 1 (test-only)
- Produces:
  - `const CURRENT_SCHEMA_VERSION: number`
  - `runMigrations(db: SqlDatabase): void`

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/schema.test.ts`:

```ts
import { openTestDatabase } from './testDatabase';
import { runMigrations, CURRENT_SCHEMA_VERSION } from '../schema';

describe('runMigrations', () => {
  it('creates all six tables', () => {
    const db = openTestDatabase();
    runMigrations(db);
    const tables = db
      .getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
      .map((row) => row.name);
    expect(tables).toEqual(['fx_rates', 'lots', 'quotes', 'sale_allocations', 'sales', 'symbols']);
  });

  it('sets PRAGMA user_version to the current schema version', () => {
    const db = openTestDatabase();
    runMigrations(db);
    const [row] = db.getAllSync<{ user_version: number }>('PRAGMA user_version;');
    expect(row!.user_version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('is idempotent — running twice does not fail or duplicate tables', () => {
    const db = openTestDatabase();
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    const tables = db.getAllSync("SELECT name FROM sqlite_master WHERE type='table';");
    expect(tables).toHaveLength(6);
  });

  it('enforces the lots -> symbols foreign key', () => {
    const db = openTestDatabase();
    runMigrations(db);
    expect(() =>
      db.runSync(
        `INSERT INTO lots (symbol_id, buy_date, price_usd, qty, fx_rate_usd_thb, created_at)
         VALUES (999, '2026-01-01', '100.000000', '10.00000000', '36.0000', '2026-01-01T00:00:00Z');`,
      ),
    ).toThrow();
  });

  it('cascades sale_allocations deletion when a sale is deleted', () => {
    const db = openTestDatabase();
    runMigrations(db);
    db.runSync("INSERT INTO symbols (ticker, name) VALUES ('NVDA', 'NVIDIA');");
    db.runSync(
      `INSERT INTO lots (symbol_id, buy_date, price_usd, qty, fx_rate_usd_thb, created_at)
       VALUES (1, '2026-01-01', '100.000000', '10.00000000', '36.0000', '2026-01-01T00:00:00Z');`,
    );
    db.runSync(
      `INSERT INTO sales (symbol_id, sell_date, qty_sold, sale_price_usd, fx_rate_usd_thb, created_at)
       VALUES (1, '2026-02-01', '5.00000000', '150.000000', '36.0000', '2026-02-01T00:00:00Z');`,
    );
    db.runSync(
      `INSERT INTO sale_allocations (sale_id, lot_id, qty_allocated, cost_basis_thb)
       VALUES (1, 1, '5.00000000', '18000.0000');`,
    );

    db.runSync('DELETE FROM sales WHERE id = 1;');

    expect(db.getAllSync('SELECT * FROM sale_allocations;')).toHaveLength(0);
  });

  it('cascades sale_allocations deletion when a lot is deleted', () => {
    const db = openTestDatabase();
    runMigrations(db);
    db.runSync("INSERT INTO symbols (ticker, name) VALUES ('NVDA', 'NVIDIA');");
    db.runSync(
      `INSERT INTO lots (symbol_id, buy_date, price_usd, qty, fx_rate_usd_thb, created_at)
       VALUES (1, '2026-01-01', '100.000000', '10.00000000', '36.0000', '2026-01-01T00:00:00Z');`,
    );
    db.runSync(
      `INSERT INTO sales (symbol_id, sell_date, qty_sold, sale_price_usd, fx_rate_usd_thb, created_at)
       VALUES (1, '2026-02-01', '5.00000000', '150.000000', '36.0000', '2026-02-01T00:00:00Z');`,
    );
    db.runSync(
      `INSERT INTO sale_allocations (sale_id, lot_id, qty_allocated, cost_basis_thb)
       VALUES (1, 1, '5.00000000', '18000.0000');`,
    );

    db.runSync('DELETE FROM lots WHERE id = 1;');

    expect(db.getAllSync('SELECT * FROM sale_allocations;')).toHaveLength(0);
  });

  it('rejects a duplicate ticker', () => {
    const db = openTestDatabase();
    runMigrations(db);
    db.runSync("INSERT INTO symbols (ticker, name) VALUES ('NVDA', 'NVIDIA');");
    expect(() => db.runSync("INSERT INTO symbols (ticker, name) VALUES ('NVDA', 'x');")).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- schema`
Expected: FAIL — `Cannot find module '../schema'`.

- [ ] **Step 3: Write the implementation**

Create `src/db/schema.ts`:

```ts
import type { SqlDatabase } from './sqlDatabase';

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * One entry per schema version, keyed by the version it produces. Applied
 * in order from the database's current PRAGMA user_version up to
 * CURRENT_SCHEMA_VERSION — SQLite reserves user_version for exactly this,
 * so no separate bookkeeping table is needed.
 */
const MIGRATIONS: Record<number, string> = {
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- schema`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/__tests__/schema.test.ts
git commit -m "feat: add SQLite schema DDL and user_version-keyed migrations

Reuses PRAGMA user_version as the schema-version counter SQLite already
reserves for this, rather than a bookkeeping table. Foreign keys and
ON DELETE CASCADE on sale_allocations are exercised directly against a
real SQLite engine via the Task 1 test adapter, not mocked."
```

---

### Task 3: Symbol repository

**Files:**
- Create: `D:\Python\fifo-tracker-mobile\src\db\repo.ts`
- Test: `D:\Python\fifo-tracker-mobile\src\db\__tests__\repo.symbols.test.ts`

**Interfaces:**
- Consumes: `SqlDatabase` from Task 1; `runMigrations` from Task 2 (test setup); `SymbolRow` from `src/core/types.ts` (plan 1) — reused as-is, since a symbol has no monetary fields and needs no `Decimal` conversion
- Produces:
  - `class DuplicateTickerError extends Error` (field: `ticker: string`)
  - `class SymbolInUseError extends Error` (fields: `symbolId: number`, `ticker: string`)
  - `createSymbol(db: SqlDatabase, ticker: string, name?: string): SymbolRow`
  - `findSymbolByTicker(db: SqlDatabase, ticker: string): SymbolRow | null`
  - `findOrCreateSymbol(db: SqlDatabase, ticker: string, name?: string): SymbolRow`
  - `listSymbols(db: SqlDatabase): SymbolRow[]`
  - `renameSymbol(db: SqlDatabase, id: number, name: string): void`
  - `deleteSymbol(db: SqlDatabase, id: number): void` (throws `SymbolInUseError` if referenced by any lot or sale)

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/repo.symbols.test.ts`:

```ts
import { openTestDatabase } from './testDatabase';
import { runMigrations } from '../schema';
import {
  createSymbol,
  findSymbolByTicker,
  findOrCreateSymbol,
  listSymbols,
  renameSymbol,
  deleteSymbol,
  DuplicateTickerError,
  SymbolInUseError,
} from '../repo';
import type { SqlDatabase } from '../sqlDatabase';

function freshDb(): SqlDatabase {
  const db = openTestDatabase();
  runMigrations(db);
  return db;
}

describe('createSymbol', () => {
  it('inserts a symbol and returns it with an id', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    expect(symbol).toEqual({ id: expect.any(Number), ticker: 'NVDA', name: 'NVIDIA' });
  });

  it('normalizes ticker to uppercase and trims whitespace', () => {
    const db = freshDb();
    const symbol = createSymbol(db, '  nvda ', 'NVIDIA');
    expect(symbol.ticker).toBe('NVDA');
  });

  it('defaults name to an empty string', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA');
    expect(symbol.name).toBe('');
  });

  it('rejects a duplicate ticker after normalization', () => {
    const db = freshDb();
    createSymbol(db, 'NVDA', 'NVIDIA');
    expect(() => createSymbol(db, ' nvda', 'x')).toThrow(DuplicateTickerError);
  });
});

describe('findSymbolByTicker', () => {
  it('resolves nvda, NVDA, and "NVDA " to the same symbol', () => {
    const db = freshDb();
    const created = createSymbol(db, 'NVDA', 'NVIDIA');
    expect(findSymbolByTicker(db, 'nvda')).toEqual(created);
    expect(findSymbolByTicker(db, 'NVDA')).toEqual(created);
    expect(findSymbolByTicker(db, 'NVDA ')).toEqual(created);
  });

  it('returns null when no symbol matches', () => {
    const db = freshDb();
    expect(findSymbolByTicker(db, 'NVDA')).toBeNull();
  });
});

describe('findOrCreateSymbol', () => {
  it('returns the existing symbol instead of creating a duplicate', () => {
    const db = freshDb();
    const created = createSymbol(db, 'NVDA', 'NVIDIA');
    const found = findOrCreateSymbol(db, 'nvda', 'ignored');
    expect(found).toEqual(created);
    expect(listSymbols(db)).toHaveLength(1);
  });

  it('creates the symbol when no match exists', () => {
    const db = freshDb();
    const symbol = findOrCreateSymbol(db, 'TSLA', 'Tesla');
    expect(symbol.ticker).toBe('TSLA');
    expect(listSymbols(db)).toHaveLength(1);
  });
});

describe('listSymbols', () => {
  it('returns symbols ordered by ticker', () => {
    const db = freshDb();
    createSymbol(db, 'TSLA', 'Tesla');
    createSymbol(db, 'NVDA', 'NVIDIA');
    expect(listSymbols(db).map((s) => s.ticker)).toEqual(['NVDA', 'TSLA']);
  });
});

describe('renameSymbol', () => {
  it('updates the display name without changing the ticker', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    renameSymbol(db, symbol.id, 'NVIDIA Corp');
    expect(findSymbolByTicker(db, 'NVDA')?.name).toBe('NVIDIA Corp');
  });
});

describe('deleteSymbol', () => {
  it('deletes a symbol with no lots or sales', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    deleteSymbol(db, symbol.id);
    expect(listSymbols(db)).toHaveLength(0);
  });

  it('refuses to delete a symbol referenced by a lot', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    db.runSync(
      `INSERT INTO lots (symbol_id, buy_date, price_usd, qty, fx_rate_usd_thb, created_at)
       VALUES (?, '2026-01-01', '100.000000', '10.00000000', '36.0000', '2026-01-01T00:00:00Z');`,
      [symbol.id],
    );
    expect(() => deleteSymbol(db, symbol.id)).toThrow(SymbolInUseError);
    expect(listSymbols(db)).toHaveLength(1);
  });

  it('refuses to delete a symbol referenced by a sale', () => {
    const db = freshDb();
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    db.runSync(
      `INSERT INTO sales (symbol_id, sell_date, qty_sold, sale_price_usd, fx_rate_usd_thb, created_at)
       VALUES (?, '2026-02-01', '5.00000000', '150.000000', '36.0000', '2026-02-01T00:00:00Z');`,
      [symbol.id],
    );
    expect(() => deleteSymbol(db, symbol.id)).toThrow(SymbolInUseError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- repo.symbols`
Expected: FAIL — `Cannot find module '../repo'`.

- [ ] **Step 3: Write the implementation**

Create `src/db/repo.ts`:

```ts
import type { SymbolRow } from '../core/types';
import type { SqlDatabase } from './sqlDatabase';

export type { SqlDatabase } from './sqlDatabase';

export class DuplicateTickerError extends Error {
  constructor(readonly ticker: string) {
    super(`Symbol ${ticker} already exists`);
    this.name = 'DuplicateTickerError';
  }
}

export class SymbolInUseError extends Error {
  constructor(readonly symbolId: number, readonly ticker: string) {
    super(`Symbol ${ticker} (id ${symbolId}) is referenced by a lot or sale and cannot be deleted`);
    this.name = 'SymbolInUseError';
  }
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export function createSymbol(db: SqlDatabase, ticker: string, name = ''): SymbolRow {
  const normalized = normalizeTicker(ticker);
  if (findSymbolByTicker(db, normalized)) {
    throw new DuplicateTickerError(normalized);
  }
  const result = db.runSync('INSERT INTO symbols (ticker, name) VALUES (?, ?);', [normalized, name]);
  return { id: result.lastInsertRowId, ticker: normalized, name };
}

export function findSymbolByTicker(db: SqlDatabase, ticker: string): SymbolRow | null {
  const rows = db.getAllSync<SymbolRow>('SELECT * FROM symbols WHERE ticker = ?;', [normalizeTicker(ticker)]);
  return rows[0] ?? null;
}

/**
 * Resolves a ticker to its symbol, creating it if it does not exist yet.
 * Needed wherever a ticker arrives as free text rather than a chosen
 * symbol id — the buy-form combo field (plan 3) and backup import
 * (plan 6) both need this rather than duplicating it.
 */
export function findOrCreateSymbol(db: SqlDatabase, ticker: string, name = ''): SymbolRow {
  return findSymbolByTicker(db, ticker) ?? createSymbol(db, ticker, name);
}

export function listSymbols(db: SqlDatabase): SymbolRow[] {
  return db.getAllSync<SymbolRow>('SELECT * FROM symbols ORDER BY ticker;');
}

export function renameSymbol(db: SqlDatabase, id: number, name: string): void {
  db.runSync('UPDATE symbols SET name = ? WHERE id = ?;', [name, id]);
}

export function deleteSymbol(db: SqlDatabase, id: number): void {
  const [symbol] = db.getAllSync<SymbolRow>('SELECT * FROM symbols WHERE id = ?;', [id]);
  if (!symbol) return;

  const [{ count: lotCount }] = db.getAllSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM lots WHERE symbol_id = ?;',
    [id],
  );
  const [{ count: saleCount }] = db.getAllSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM sales WHERE symbol_id = ?;',
    [id],
  );
  if (lotCount > 0 || saleCount > 0) {
    throw new SymbolInUseError(id, symbol.ticker);
  }

  db.runSync('DELETE FROM symbols WHERE id = ?;', [id]);
}
```

Note: `COUNT(*)` is a row count, not a sum over a money/quantity column — it does not touch the "never `SUM()` a TEXT column" constraint.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- repo.symbols`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts src/db/__tests__/repo.symbols.test.ts
git commit -m "feat: add symbol repository with ticker normalization

Reuses core/types.ts's SymbolRow directly rather than redeclaring it —
a symbol has no monetary field, so there is nothing for db/ to convert.
Ticker normalization (uppercase, trimmed) happens here, at the one place
a ticker is ever written, so nvda/NVDA/'NVDA ' can never become three
separate rows."
```

---

### Task 4: Lot repository

**Files:**
- Modify: `D:\Python\fifo-tracker-mobile\src\db\repo.ts`
- Test: `D:\Python\fifo-tracker-mobile\src\db\__tests__\repo.lots.test.ts`

**Interfaces:**
- Consumes: `SqlDatabase`, `createSymbol` (test setup)
- Produces:
  - `interface LotRow { id: number; symbolId: number; buyDate: string; priceUsd: string; qty: string; fxRateUsdThb: string; createdAt: string; evidenceFile: string | null }`
  - `interface NewLotRow` — same shape as `LotRow` minus `id`
  - `insertLot(db: SqlDatabase, lot: NewLotRow): LotRow`
  - `listLots(db: SqlDatabase, symbolId?: number): LotRow[]` (ordered `buy_date, created_at, id` — the FIFO order)
  - `getLot(db: SqlDatabase, id: number): LotRow | null`
  - `updateLot(db: SqlDatabase, id: number, lot: NewLotRow): void` (never changes `created_at`)
  - `deleteLot(db: SqlDatabase, id: number): void`

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/repo.lots.test.ts`:

```ts
import { openTestDatabase } from './testDatabase';
import { runMigrations } from '../schema';
import { createSymbol, insertLot, listLots, getLot, updateLot, deleteLot } from '../repo';
import type { NewLotRow, SqlDatabase } from '../repo';

function freshDbWithSymbol(): { db: SqlDatabase; symbolId: number } {
  const db = openTestDatabase();
  runMigrations(db);
  const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
  return { db, symbolId: symbol.id };
}

const baseLot = (symbolId: number, overrides: Partial<NewLotRow> = {}): NewLotRow => ({
  symbolId,
  buyDate: '2026-01-01',
  priceUsd: '142.350000',
  qty: '10.00000000',
  fxRateUsdThb: '36.2100',
  createdAt: '2026-01-01T00:00:00Z',
  evidenceFile: null,
  ...overrides,
});

describe('insertLot', () => {
  it('inserts a lot and returns it with an id', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = insertLot(db, baseLot(symbolId));
    expect(lot).toEqual({ id: expect.any(Number), ...baseLot(symbolId) });
  });

  it('stores every monetary field as the exact string given, never coerced', () => {
    const { db, symbolId } = freshDbWithSymbol();
    insertLot(db, baseLot(symbolId, { priceUsd: '0.000001', qty: '0.00000001' }));
    const [raw] = db.getAllSync<{ price_usd: string; qty: string }>('SELECT price_usd, qty FROM lots;');
    expect(raw!.price_usd).toBe('0.000001');
    expect(raw!.qty).toBe('0.00000001');
  });

  it('rejects an unknown symbol id via the foreign key', () => {
    const { db } = freshDbWithSymbol();
    expect(() => insertLot(db, baseLot(999))).toThrow();
  });
});

describe('listLots', () => {
  it('orders by buy_date, created_at, id — the FIFO order', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const later = insertLot(db, baseLot(symbolId, { buyDate: '2026-03-01', createdAt: '2026-03-01T00:00:00Z' }));
    const earlier = insertLot(db, baseLot(symbolId, { buyDate: '2026-01-01', createdAt: '2026-01-01T00:00:00Z' }));
    expect(listLots(db).map((l) => l.id)).toEqual([earlier.id, later.id]);
  });

  it('filters by symbolId when given', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const other = createSymbol(db, 'TSLA', 'Tesla');
    insertLot(db, baseLot(symbolId));
    insertLot(db, baseLot(other.id));
    expect(listLots(db, symbolId)).toHaveLength(1);
  });
});

describe('getLot', () => {
  it('returns null for an id that does not exist', () => {
    const { db } = freshDbWithSymbol();
    expect(getLot(db, 999)).toBeNull();
  });
});

describe('updateLot', () => {
  it('updates fields but never created_at', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = insertLot(db, baseLot(symbolId));
    updateLot(db, lot.id, baseLot(symbolId, { qty: '5.00000000', createdAt: '2099-01-01T00:00:00Z' }));
    const updated = getLot(db, lot.id);
    expect(updated?.qty).toBe('5.00000000');
    expect(updated?.createdAt).toBe(lot.createdAt);
  });
});

describe('deleteLot', () => {
  it('removes the lot', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = insertLot(db, baseLot(symbolId));
    deleteLot(db, lot.id);
    expect(getLot(db, lot.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- repo.lots`
Expected: FAIL — `insertLot` and friends are not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/db/repo.ts`:

```ts
export interface LotRow {
  id: number;
  symbolId: number;
  buyDate: string;
  priceUsd: string;
  qty: string;
  fxRateUsdThb: string;
  createdAt: string;
  evidenceFile: string | null;
}

export type NewLotRow = Omit<LotRow, 'id'>;

interface LotDbRow {
  id: number;
  symbol_id: number;
  buy_date: string;
  price_usd: string;
  qty: string;
  fx_rate_usd_thb: string;
  created_at: string;
  evidence_file: string | null;
}

function toLotRow(row: LotDbRow): LotRow {
  return {
    id: row.id,
    symbolId: row.symbol_id,
    buyDate: row.buy_date,
    priceUsd: row.price_usd,
    qty: row.qty,
    fxRateUsdThb: row.fx_rate_usd_thb,
    createdAt: row.created_at,
    evidenceFile: row.evidence_file,
  };
}

export function insertLot(db: SqlDatabase, lot: NewLotRow): LotRow {
  const result = db.runSync(
    `INSERT INTO lots (symbol_id, buy_date, price_usd, qty, fx_rate_usd_thb, created_at, evidence_file)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [lot.symbolId, lot.buyDate, lot.priceUsd, lot.qty, lot.fxRateUsdThb, lot.createdAt, lot.evidenceFile],
  );
  return { id: result.lastInsertRowId, ...lot };
}

export function listLots(db: SqlDatabase, symbolId?: number): LotRow[] {
  const rows = symbolId === undefined
    ? db.getAllSync<LotDbRow>('SELECT * FROM lots ORDER BY buy_date, created_at, id;')
    : db.getAllSync<LotDbRow>(
        'SELECT * FROM lots WHERE symbol_id = ? ORDER BY buy_date, created_at, id;',
        [symbolId],
      );
  return rows.map(toLotRow);
}

export function getLot(db: SqlDatabase, id: number): LotRow | null {
  const [row] = db.getAllSync<LotDbRow>('SELECT * FROM lots WHERE id = ?;', [id]);
  return row ? toLotRow(row) : null;
}

/** Never touches created_at — it is the FIFO tiebreak stamp, fixed at insert. */
export function updateLot(db: SqlDatabase, id: number, lot: NewLotRow): void {
  db.runSync(
    `UPDATE lots SET symbol_id = ?, buy_date = ?, price_usd = ?, qty = ?, fx_rate_usd_thb = ?, evidence_file = ?
     WHERE id = ?;`,
    [lot.symbolId, lot.buyDate, lot.priceUsd, lot.qty, lot.fxRateUsdThb, lot.evidenceFile, id],
  );
}

export function deleteLot(db: SqlDatabase, id: number): void {
  db.runSync('DELETE FROM lots WHERE id = ?;', [id]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- repo.lots`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts src/db/__tests__/repo.lots.test.ts
git commit -m "feat: add lot repository

updateLot never writes created_at: it is the FIFO tiebreak timestamp
fixed at insert, and editing a lot's price or quantity must not change
where it sorts against same-day lots."
```

---

### Task 5: Sale repository

**Files:**
- Modify: `D:\Python\fifo-tracker-mobile\src\db\repo.ts`
- Test: `D:\Python\fifo-tracker-mobile\src\db\__tests__\repo.sales.test.ts`

**Interfaces:**
- Consumes: `SqlDatabase`, `createSymbol` (test setup)
- Produces:
  - `interface SaleRow { id: number; symbolId: number; sellDate: string; qtySold: string; salePriceUsd: string; feeUsd: string; fxRateUsdThb: string; createdAt: string; evidenceFile: string | null }`
  - `interface NewSaleRow` — same shape as `SaleRow` minus `id`
  - `insertSale(db: SqlDatabase, sale: NewSaleRow): SaleRow`
  - `listSales(db: SqlDatabase, symbolId?: number): SaleRow[]` (ordered `sell_date, created_at, id`)
  - `getSale(db: SqlDatabase, id: number): SaleRow | null`
  - `updateSale(db: SqlDatabase, id: number, sale: NewSaleRow): void` (never changes `created_at`)
  - `deleteSale(db: SqlDatabase, id: number): void`

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/repo.sales.test.ts`:

```ts
import { openTestDatabase } from './testDatabase';
import { runMigrations } from '../schema';
import { createSymbol, insertSale, listSales, getSale, updateSale, deleteSale } from '../repo';
import type { NewSaleRow, SqlDatabase } from '../repo';

function freshDbWithSymbol(): { db: SqlDatabase; symbolId: number } {
  const db = openTestDatabase();
  runMigrations(db);
  const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
  return { db, symbolId: symbol.id };
}

const baseSale = (symbolId: number, overrides: Partial<NewSaleRow> = {}): NewSaleRow => ({
  symbolId,
  sellDate: '2026-06-01',
  qtySold: '4.00000000',
  salePriceUsd: '150.000000',
  feeUsd: '0.0000',
  fxRateUsdThb: '36.0000',
  createdAt: '2026-06-01T00:00:00Z',
  evidenceFile: null,
  ...overrides,
});

describe('insertSale', () => {
  it('inserts a sale and returns it with an id', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const sale = insertSale(db, baseSale(symbolId));
    expect(sale).toEqual({ id: expect.any(Number), ...baseSale(symbolId) });
  });

  it('rejects an unknown symbol id via the foreign key', () => {
    const { db } = freshDbWithSymbol();
    expect(() => insertSale(db, baseSale(999))).toThrow();
  });
});

describe('listSales', () => {
  it('orders by sell_date, created_at, id', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const later = insertSale(db, baseSale(symbolId, { sellDate: '2026-08-01', createdAt: '2026-08-01T00:00:00Z' }));
    const earlier = insertSale(db, baseSale(symbolId, { sellDate: '2026-06-01', createdAt: '2026-06-01T00:00:00Z' }));
    expect(listSales(db).map((s) => s.id)).toEqual([earlier.id, later.id]);
  });

  it('filters by symbolId when given', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const other = createSymbol(db, 'TSLA', 'Tesla');
    insertSale(db, baseSale(symbolId));
    insertSale(db, baseSale(other.id));
    expect(listSales(db, symbolId)).toHaveLength(1);
  });
});

describe('getSale', () => {
  it('returns null for an id that does not exist', () => {
    const { db } = freshDbWithSymbol();
    expect(getSale(db, 999)).toBeNull();
  });
});

describe('updateSale', () => {
  it('updates fields but never created_at', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const sale = insertSale(db, baseSale(symbolId));
    updateSale(db, sale.id, baseSale(symbolId, { qtySold: '2.00000000', createdAt: '2099-01-01T00:00:00Z' }));
    const updated = getSale(db, sale.id);
    expect(updated?.qtySold).toBe('2.00000000');
    expect(updated?.createdAt).toBe(sale.createdAt);
  });
});

describe('deleteSale', () => {
  it('removes the sale', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const sale = insertSale(db, baseSale(symbolId));
    deleteSale(db, sale.id);
    expect(getSale(db, sale.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- repo.sales`
Expected: FAIL — `insertSale` and friends are not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/db/repo.ts`:

```ts
export interface SaleRow {
  id: number;
  symbolId: number;
  sellDate: string;
  qtySold: string;
  salePriceUsd: string;
  feeUsd: string;
  fxRateUsdThb: string;
  createdAt: string;
  evidenceFile: string | null;
}

export type NewSaleRow = Omit<SaleRow, 'id'>;

interface SaleDbRow {
  id: number;
  symbol_id: number;
  sell_date: string;
  qty_sold: string;
  sale_price_usd: string;
  fee_usd: string;
  fx_rate_usd_thb: string;
  created_at: string;
  evidence_file: string | null;
}

function toSaleRow(row: SaleDbRow): SaleRow {
  return {
    id: row.id,
    symbolId: row.symbol_id,
    sellDate: row.sell_date,
    qtySold: row.qty_sold,
    salePriceUsd: row.sale_price_usd,
    feeUsd: row.fee_usd,
    fxRateUsdThb: row.fx_rate_usd_thb,
    createdAt: row.created_at,
    evidenceFile: row.evidence_file,
  };
}

export function insertSale(db: SqlDatabase, sale: NewSaleRow): SaleRow {
  const result = db.runSync(
    `INSERT INTO sales (symbol_id, sell_date, qty_sold, sale_price_usd, fee_usd, fx_rate_usd_thb, created_at, evidence_file)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      sale.symbolId, sale.sellDate, sale.qtySold, sale.salePriceUsd,
      sale.feeUsd, sale.fxRateUsdThb, sale.createdAt, sale.evidenceFile,
    ],
  );
  return { id: result.lastInsertRowId, ...sale };
}

export function listSales(db: SqlDatabase, symbolId?: number): SaleRow[] {
  const rows = symbolId === undefined
    ? db.getAllSync<SaleDbRow>('SELECT * FROM sales ORDER BY sell_date, created_at, id;')
    : db.getAllSync<SaleDbRow>(
        'SELECT * FROM sales WHERE symbol_id = ? ORDER BY sell_date, created_at, id;',
        [symbolId],
      );
  return rows.map(toSaleRow);
}

export function getSale(db: SqlDatabase, id: number): SaleRow | null {
  const [row] = db.getAllSync<SaleDbRow>('SELECT * FROM sales WHERE id = ?;', [id]);
  return row ? toSaleRow(row) : null;
}

/** Never touches created_at — it is the FIFO tiebreak stamp, fixed at insert. */
export function updateSale(db: SqlDatabase, id: number, sale: NewSaleRow): void {
  db.runSync(
    `UPDATE sales SET symbol_id = ?, sell_date = ?, qty_sold = ?, sale_price_usd = ?,
       fee_usd = ?, fx_rate_usd_thb = ?, evidence_file = ?
     WHERE id = ?;`,
    [
      sale.symbolId, sale.sellDate, sale.qtySold, sale.salePriceUsd,
      sale.feeUsd, sale.fxRateUsdThb, sale.evidenceFile, id,
    ],
  );
}

export function deleteSale(db: SqlDatabase, id: number): void {
  db.runSync('DELETE FROM sales WHERE id = ?;', [id]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- repo.sales`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts src/db/__tests__/repo.sales.test.ts
git commit -m "feat: add sale repository"
```

---

### Task 6: Allocation repository

**Files:**
- Modify: `D:\Python\fifo-tracker-mobile\src\db\repo.ts`
- Test: `D:\Python\fifo-tracker-mobile\src\db\__tests__\repo.allocations.test.ts`

**Interfaces:**
- Consumes: `SqlDatabase`, `createSymbol`/`insertLot`/`insertSale` (test setup)
- Produces:
  - `interface AllocationRow { saleId: number; lotId: number; qtyAllocated: string; costBasisThb: string }`
  - `replaceAllAllocations(db: SqlDatabase, allocations: readonly AllocationRow[]): void` (deletes every existing allocation, then inserts the given set — this is the primitive `rebuildLedger` in Task 7 calls)
  - `listAllocations(db: SqlDatabase, filter?: { saleId?: number; lotId?: number }): AllocationRow[]`

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/repo.allocations.test.ts`:

```ts
import { openTestDatabase } from './testDatabase';
import { runMigrations } from '../schema';
import { createSymbol, insertLot, insertSale, replaceAllAllocations, listAllocations } from '../repo';
import type { SqlDatabase } from '../repo';

function freshDbWithLotAndSale(): { db: SqlDatabase; lotId: number; saleId: number } {
  const db = openTestDatabase();
  runMigrations(db);
  const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
  const lot = insertLot(db, {
    symbolId: symbol.id, buyDate: '2026-01-01', priceUsd: '100.000000',
    qty: '10.00000000', fxRateUsdThb: '36.0000', createdAt: '2026-01-01T00:00:00Z', evidenceFile: null,
  });
  const sale = insertSale(db, {
    symbolId: symbol.id, sellDate: '2026-06-01', qtySold: '4.00000000', salePriceUsd: '150.000000',
    feeUsd: '0.0000', fxRateUsdThb: '36.0000', createdAt: '2026-06-01T00:00:00Z', evidenceFile: null,
  });
  return { db, lotId: lot.id, saleId: sale.id };
}

describe('replaceAllAllocations', () => {
  it('inserts the given allocations', () => {
    const { db, lotId, saleId } = freshDbWithLotAndSale();
    replaceAllAllocations(db, [{ saleId, lotId, qtyAllocated: '4.00000000', costBasisThb: '14400.0000' }]);
    expect(listAllocations(db)).toEqual([{ saleId, lotId, qtyAllocated: '4.00000000', costBasisThb: '14400.0000' }]);
  });

  it('replaces the entire set, discarding whatever was there before', () => {
    const { db, lotId, saleId } = freshDbWithLotAndSale();
    replaceAllAllocations(db, [{ saleId, lotId, qtyAllocated: '4.00000000', costBasisThb: '14400.0000' }]);
    replaceAllAllocations(db, []);
    expect(listAllocations(db)).toEqual([]);
  });

  it('rejects an allocation whose sale or lot does not exist', () => {
    const { db } = freshDbWithLotAndSale();
    expect(() => replaceAllAllocations(db, [{ saleId: 999, lotId: 999, qtyAllocated: '1', costBasisThb: '1' }])).toThrow();
  });
});

describe('listAllocations', () => {
  it('filters by saleId', () => {
    const { db, lotId, saleId } = freshDbWithLotAndSale();
    replaceAllAllocations(db, [{ saleId, lotId, qtyAllocated: '4.00000000', costBasisThb: '14400.0000' }]);
    expect(listAllocations(db, { saleId })).toHaveLength(1);
    expect(listAllocations(db, { saleId: 999 })).toHaveLength(0);
  });

  it('filters by lotId', () => {
    const { db, lotId, saleId } = freshDbWithLotAndSale();
    replaceAllAllocations(db, [{ saleId, lotId, qtyAllocated: '4.00000000', costBasisThb: '14400.0000' }]);
    expect(listAllocations(db, { lotId })).toHaveLength(1);
    expect(listAllocations(db, { lotId: 999 })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- repo.allocations`
Expected: FAIL — `replaceAllAllocations` and `listAllocations` are not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/db/repo.ts`:

```ts
export interface AllocationRow {
  saleId: number;
  lotId: number;
  qtyAllocated: string;
  costBasisThb: string;
}

interface AllocationDbRow {
  sale_id: number;
  lot_id: number;
  qty_allocated: string;
  cost_basis_thb: string;
}

function toAllocationRow(row: AllocationDbRow): AllocationRow {
  return {
    saleId: row.sale_id,
    lotId: row.lot_id,
    qtyAllocated: row.qty_allocated,
    costBasisThb: row.cost_basis_thb,
  };
}

/**
 * Discards every existing allocation and inserts the given set. Allocations
 * are derived data (spec §2.4) — there is no update-in-place, only
 * wholesale replacement after every rebuild.
 */
export function replaceAllAllocations(db: SqlDatabase, allocations: readonly AllocationRow[]): void {
  db.runSync('DELETE FROM sale_allocations;');
  for (const allocation of allocations) {
    db.runSync(
      'INSERT INTO sale_allocations (sale_id, lot_id, qty_allocated, cost_basis_thb) VALUES (?, ?, ?, ?);',
      [allocation.saleId, allocation.lotId, allocation.qtyAllocated, allocation.costBasisThb],
    );
  }
}

export function listAllocations(
  db: SqlDatabase,
  filter?: { saleId?: number; lotId?: number },
): AllocationRow[] {
  if (filter?.saleId !== undefined) {
    return db
      .getAllSync<AllocationDbRow>('SELECT * FROM sale_allocations WHERE sale_id = ?;', [filter.saleId])
      .map(toAllocationRow);
  }
  if (filter?.lotId !== undefined) {
    return db
      .getAllSync<AllocationDbRow>('SELECT * FROM sale_allocations WHERE lot_id = ?;', [filter.lotId])
      .map(toAllocationRow);
  }
  return db.getAllSync<AllocationDbRow>('SELECT * FROM sale_allocations;').map(toAllocationRow);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- repo.allocations`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts src/db/__tests__/repo.allocations.test.ts
git commit -m "feat: add allocation repository with wholesale replace

No update-in-place for allocations: they are derived data (spec §2.4),
so the only write operation is replaceAllAllocations, which discards
the previous set entirely."
```

---

### Task 7: Ledger service — the rebuild-on-every-mutation orchestrator

**Files:**
- Create: `D:\Python\fifo-tracker-mobile\src\services\ledger.ts`
- Test: `D:\Python\fifo-tracker-mobile\src\services\__tests__\ledger.test.ts`

**Interfaces:**
- Consumes: `SqlDatabase` (Task 1); `runMigrations` (Task 2); `repo.ts`'s full surface (Tasks 3–6); `core/money.ts`'s `DP`, `toStored`, `fromStored`; `core/fifo.ts`'s `rebuildAllocations`, `InsufficientLotsError`; `core/types.ts`'s `Lot`, `Sale`
- Produces:
  - `interface NewLotInput { symbolId: number; buyDate: string; priceUsd: Decimal; qty: Decimal; fxRateUsdThb: Decimal; evidenceFile: string | null }`
  - `interface NewSaleInput { symbolId: number; sellDate: string; qtySold: Decimal; salePriceUsd: Decimal; feeUsd: Decimal; fxRateUsdThb: Decimal; evidenceFile: string | null }`
  - `rebuildLedger(db: SqlDatabase): void`
  - `addLot(db: SqlDatabase, input: NewLotInput): repo.LotRow`
  - `editLot(db: SqlDatabase, id: number, input: NewLotInput): void`
  - `deleteLot(db: SqlDatabase, id: number): void`
  - `addSale(db: SqlDatabase, input: NewSaleInput): repo.SaleRow`
  - `editSale(db: SqlDatabase, id: number, input: NewSaleInput): void`
  - `deleteSale(db: SqlDatabase, id: number): void`

This is the task where a bug costs real money — every mutation must leave the database either fully updated and consistent, or completely untouched. Read `src/core/fifo.ts`'s `InsufficientLotsError` and the spec's §2.4 and §4.4 before starting.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/ledger.test.ts`:

```ts
import Decimal from 'decimal.js';
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { createSymbol, listAllocations, listSales, getLot, getSale } from '../../db/repo';
import { InsufficientLotsError } from '../../core/fifo';
import { addLot, editLot, deleteLot, addSale, editSale, deleteSale, rebuildLedger } from '../ledger';
import type { SqlDatabase } from '../../db/sqlDatabase';
import type { NewLotInput, NewSaleInput } from '../ledger';

function freshDbWithSymbol(): { db: SqlDatabase; symbolId: number } {
  const db = openTestDatabase();
  runMigrations(db);
  const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
  return { db, symbolId: symbol.id };
}

const lotInput = (symbolId: number, overrides: Partial<NewLotInput> = {}): NewLotInput => ({
  symbolId,
  buyDate: '2026-01-01',
  priceUsd: new Decimal('142.35'),
  qty: new Decimal('10'),
  fxRateUsdThb: new Decimal('36.21'),
  evidenceFile: null,
  ...overrides,
});

const saleInput = (symbolId: number, overrides: Partial<NewSaleInput> = {}): NewSaleInput => ({
  symbolId,
  sellDate: '2026-06-01',
  qtySold: new Decimal('4'),
  salePriceUsd: new Decimal('150'),
  feeUsd: new Decimal('0'),
  fxRateUsdThb: new Decimal('36'),
  evidenceFile: null,
  ...overrides,
});

describe('addLot', () => {
  it('stores every monetary field at its fixed decimal-place precision', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId));
    expect(lot.priceUsd).toBe('142.350000');
    expect(lot.qty).toBe('10.00000000');
    expect(lot.fxRateUsdThb).toBe('36.2100');
  });

  it('assigns createdAt itself', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId));
    expect(() => new Date(lot.createdAt).toISOString()).not.toThrow();
  });
});

describe('addSale', () => {
  it('allocates against the existing lot and persists the allocation', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId));
    const sale = addSale(db, saleInput(symbolId));

    const allocations = listAllocations(db, { saleId: sale.id });
    expect(allocations).toEqual([
      { saleId: sale.id, lotId: lot.id, qtyAllocated: '4.00000000', costBasisThb: '20617.9740' },
    ]);
  });

  it('spans a sale across two lots, oldest first', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const older = addLot(db, lotInput(symbolId, { buyDate: '2026-01-01', qty: new Decimal('3') }));
    const newer = addLot(db, lotInput(symbolId, { buyDate: '2026-02-01', qty: new Decimal('3') }));
    const sale = addSale(db, saleInput(symbolId, { qtySold: new Decimal('5') }));

    const allocations = listAllocations(db, { saleId: sale.id });
    expect(allocations.map((a) => a.lotId)).toEqual([older.id, newer.id]);
    expect(allocations.map((a) => a.qtyAllocated)).toEqual(['3.00000000', '2.00000000']);
  });

  it('rolls back entirely when the sale cannot be covered', () => {
    const { db, symbolId } = freshDbWithSymbol();
    addLot(db, lotInput(symbolId, { qty: new Decimal('1') }));

    expect(() => addSale(db, saleInput(symbolId, { qtySold: new Decimal('5') }))).toThrow(InsufficientLotsError);

    expect(listSales(db)).toHaveLength(0);
    expect(listAllocations(db)).toHaveLength(0);
  });
});

describe('editLot', () => {
  it('rebuilds allocations after the edit', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    const sale = addSale(db, saleInput(symbolId, { qtySold: new Decimal('4') }));

    editLot(db, lot.id, lotInput(symbolId, { qty: new Decimal('20') }));

    expect(getLot(db, lot.id)?.qty).toBe('20.00000000');
    expect(listAllocations(db, { saleId: sale.id })[0]?.qtyAllocated).toBe('4.00000000');
  });

  it('rolls back the edit when it would break an existing sale', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    addSale(db, saleInput(symbolId, { qtySold: new Decimal('8') }));

    expect(() => editLot(db, lot.id, lotInput(symbolId, { qty: new Decimal('2') })))
      .toThrow(InsufficientLotsError);

    expect(getLot(db, lot.id)?.qty).toBe('10.00000000');
  });
});

describe('deleteLot', () => {
  it('rolls back when deleting a lot would leave a sale uncovered', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    addSale(db, saleInput(symbolId, { qtySold: new Decimal('4') }));

    expect(() => deleteLot(db, lot.id)).toThrow(InsufficientLotsError);
    expect(getLot(db, lot.id)).not.toBeNull();
  });

  it('succeeds when no sale depends on the lot', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId));
    deleteLot(db, lot.id);
    expect(getLot(db, lot.id)).toBeNull();
  });
});

describe('editSale', () => {
  it('rebuilds allocations to match the new quantity', () => {
    const { db, symbolId } = freshDbWithSymbol();
    addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    const sale = addSale(db, saleInput(symbolId, { qtySold: new Decimal('4') }));

    editSale(db, sale.id, saleInput(symbolId, { qtySold: new Decimal('6') }));

    expect(listAllocations(db, { saleId: sale.id })[0]?.qtyAllocated).toBe('6.00000000');
  });
});

describe('deleteSale', () => {
  it('clears the sale\'s allocations', () => {
    const { db, symbolId } = freshDbWithSymbol();
    addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    const sale = addSale(db, saleInput(symbolId, { qtySold: new Decimal('4') }));

    deleteSale(db, sale.id);

    expect(getSale(db, sale.id)).toBeNull();
    expect(listAllocations(db)).toHaveLength(0);
  });
});

describe('rebuildLedger', () => {
  it('is safe to call directly and is idempotent', () => {
    const { db, symbolId } = freshDbWithSymbol();
    addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    const sale = addSale(db, saleInput(symbolId, { qtySold: new Decimal('4') }));

    rebuildLedger(db);
    rebuildLedger(db);

    expect(listAllocations(db, { saleId: sale.id })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ledger`
Expected: FAIL — `Cannot find module '../ledger'`.

- [ ] **Step 3: Write the implementation**

Create `src/services/ledger.ts`:

```ts
import Decimal from 'decimal.js';
import { fromStored, toStored, DP } from '../core/money';
import { rebuildAllocations } from '../core/fifo';
import type { Lot, Sale } from '../core/types';
import type { SqlDatabase } from '../db/sqlDatabase';
import * as repo from '../db/repo';

export interface NewLotInput {
  symbolId: number;
  buyDate: string;
  priceUsd: Decimal;
  qty: Decimal;
  fxRateUsdThb: Decimal;
  evidenceFile: string | null;
}

export interface NewSaleInput {
  symbolId: number;
  sellDate: string;
  qtySold: Decimal;
  salePriceUsd: Decimal;
  feeUsd: Decimal;
  fxRateUsdThb: Decimal;
  evidenceFile: string | null;
}

function toDomainLot(row: repo.LotRow): Lot {
  return {
    id: row.id,
    symbolId: row.symbolId,
    buyDate: row.buyDate,
    priceUsd: fromStored(row.priceUsd),
    qty: fromStored(row.qty),
    fxRateUsdThb: fromStored(row.fxRateUsdThb),
    createdAt: row.createdAt,
    evidenceFile: row.evidenceFile,
  };
}

function toDomainSale(row: repo.SaleRow): Sale {
  return {
    id: row.id,
    symbolId: row.symbolId,
    sellDate: row.sellDate,
    qtySold: fromStored(row.qtySold),
    salePriceUsd: fromStored(row.salePriceUsd),
    feeUsd: fromStored(row.feeUsd),
    fxRateUsdThb: fromStored(row.fxRateUsdThb),
    createdAt: row.createdAt,
    evidenceFile: row.evidenceFile,
  };
}

function toLotRow(input: NewLotInput, createdAt: string): repo.NewLotRow {
  return {
    symbolId: input.symbolId,
    buyDate: input.buyDate,
    priceUsd: toStored(input.priceUsd, DP.price),
    qty: toStored(input.qty, DP.qty),
    fxRateUsdThb: toStored(input.fxRateUsdThb, DP.fxRate),
    createdAt,
    evidenceFile: input.evidenceFile,
  };
}

function toSaleRow(input: NewSaleInput, createdAt: string): repo.NewSaleRow {
  return {
    symbolId: input.symbolId,
    sellDate: input.sellDate,
    qtySold: toStored(input.qtySold, DP.qty),
    salePriceUsd: toStored(input.salePriceUsd, DP.price),
    feeUsd: toStored(input.feeUsd, DP.money),
    fxRateUsdThb: toStored(input.fxRateUsdThb, DP.fxRate),
    createdAt,
    evidenceFile: input.evidenceFile,
  };
}

/**
 * Recomputes every allocation from scratch and replaces the
 * sale_allocations table with the result (spec §2.4: allocations are
 * derived, never authoritative). Runs inside the caller's transaction —
 * it never opens its own, so a caller can compose it with other writes
 * and roll everything back together.
 */
export function rebuildLedger(db: SqlDatabase): void {
  const lots = repo.listLots(db).map(toDomainLot);
  const sales = repo.listSales(db).map(toDomainSale);
  const allocations = rebuildAllocations(lots, sales);
  repo.replaceAllAllocations(
    db,
    allocations.map((allocation) => ({
      saleId: allocation.saleId,
      lotId: allocation.lotId,
      qtyAllocated: toStored(allocation.qtyAllocated, DP.qty),
      costBasisThb: toStored(allocation.costBasisThb, DP.money),
    })),
  );
}

function withTransaction<T>(db: SqlDatabase, fn: () => T): T {
  db.execSync('BEGIN;');
  try {
    const result = fn();
    db.execSync('COMMIT;');
    return result;
  } catch (error) {
    db.execSync('ROLLBACK;');
    throw error;
  }
}

export function addLot(db: SqlDatabase, input: NewLotInput): repo.LotRow {
  return withTransaction(db, () => {
    const inserted = repo.insertLot(db, toLotRow(input, new Date().toISOString()));
    rebuildLedger(db);
    return inserted;
  });
}

export function editLot(db: SqlDatabase, id: number, input: NewLotInput): void {
  withTransaction(db, () => {
    const existing = repo.getLot(db, id);
    if (!existing) throw new Error(`Lot ${id} does not exist`);
    repo.updateLot(db, id, toLotRow(input, existing.createdAt));
    rebuildLedger(db);
  });
}

export function deleteLot(db: SqlDatabase, id: number): void {
  withTransaction(db, () => {
    repo.deleteLot(db, id);
    rebuildLedger(db);
  });
}

export function addSale(db: SqlDatabase, input: NewSaleInput): repo.SaleRow {
  return withTransaction(db, () => {
    const inserted = repo.insertSale(db, toSaleRow(input, new Date().toISOString()));
    rebuildLedger(db);
    return inserted;
  });
}

export function editSale(db: SqlDatabase, id: number, input: NewSaleInput): void {
  withTransaction(db, () => {
    const existing = repo.getSale(db, id);
    if (!existing) throw new Error(`Sale ${id} does not exist`);
    repo.updateSale(db, id, toSaleRow(input, existing.createdAt));
    rebuildLedger(db);
  });
}

export function deleteSale(db: SqlDatabase, id: number): void {
  withTransaction(db, () => {
    repo.deleteSale(db, id);
    rebuildLedger(db);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- ledger`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/ledger.ts src/services/__tests__/ledger.test.ts
git commit -m "feat: add ledger service — the rebuild-on-every-mutation orchestrator

addLot/editLot/deleteLot/addSale/editSale/deleteSale each run inside one
transaction that ends with rebuildLedger(): every allocation is thrown
away and replayed from scratch via core/fifo.ts. If the rebuild throws
(InsufficientLotsError, most commonly), the whole mutation rolls back and
the database is left exactly as it was — spec §4.4's safety net, applied
to live edits and not just import.

This is the one place Decimal values cross into and out of TEXT storage;
db/repo.ts never sees a Decimal, and core/ never sees a string that came
from a form."
```

---

### Task 8: Harden layer isolation and prove the stack composes end to end

**Files:**
- Modify: `D:\Python\fifo-tracker-mobile\src\core\__tests__\isolation.test.ts`
- Create: `D:\Python\fifo-tracker-mobile\src\services\__tests__\integration.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–7
- Produces: nothing new — this task closes two gaps plan 1's final review flagged as deferred rather than blocking (recorded in that plan's ledger): the isolation scan only matched static `from '...'` imports, and `core/money.ts` was never proven to round-trip correctly against real engine output through actual storage.

- [ ] **Step 1: Harden the isolation test**

`src/core/__tests__/isolation.test.ts` currently only catches `from '...'` imports. Now that `src/db/` exists, a `require('../db/repo')` or a dynamic `import('../db/repo')` inside `core/` would defeat the whole point of the layering and this test would miss it.

Modify `src/core/__tests__/isolation.test.ts`:

```ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * core/ must stay runnable under plain Node with no emulator and no
 * database. That property is what makes the money-critical code cheap to
 * test, and it is easy to destroy accidentally with a single import.
 *
 * Checks both static `from '...'` imports and `require(...)` /
 * dynamic `import(...)` calls — a static-only check would miss a
 * require() or dynamic import() of expo-sqlite or db/repo.ts.
 */
const CORE_DIR = join(__dirname, '..');
const FORBIDDEN = [
  /from ['"]react/,
  /from ['"]expo/,
  /from ['"]@expo/,
  /from ['"]\.\.\/db/,
  /require\(['"]react/,
  /require\(['"]expo/,
  /require\(['"]@expo/,
  /require\(['"]\.\.\/db/,
  /import\(['"]react/,
  /import\(['"]expo/,
  /import\(['"]@expo/,
  /import\(['"]\.\.\/db/,
];

describe('core layer isolation', () => {
  const sources = readdirSync(CORE_DIR).filter((name) => name.endsWith('.ts'));

  it('finds the core source files', () => {
    expect(sources.sort()).toEqual(['derive.ts', 'fifo.ts', 'money.ts', 'types.ts']);
  });

  it.each(sources)('%s imports nothing from React, Expo or the database', (name) => {
    const source = readFileSync(join(CORE_DIR, name), 'utf8');
    for (const pattern of FORBIDDEN) {
      expect(source).not.toMatch(pattern);
    }
  });
});
```

- [ ] **Step 2: Run the isolation test**

Run: `npm test -- isolation`
Expected: PASS, 5 tests (unchanged count — the new patterns don't match anything in the current `core/` files, they only widen what future changes are checked against).

- [ ] **Step 3: Write the full-stack integration test**

Create `src/services/__tests__/integration.test.ts`:

```ts
import Decimal from 'decimal.js';
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { createSymbol, listLots, listSales, listAllocations } from '../../db/repo';
import { fromStored } from '../../core/money';
import { lotQtyRemaining, saleCapitalGainThb } from '../../core/derive';
import { addLot, addSale, deleteSale } from '../ledger';
import type { Allocation } from '../../core/types';

/**
 * Proves the whole stack composes: a form-shaped Decimal input persists
 * through services/ledger.ts -> db/repo.ts -> SQLite TEXT columns and back
 * out through core/derive.ts, with no precision lost anywhere in the round
 * trip. This is the storage-round-trip proof plan 1's final review noted
 * core/money.ts never got on its own.
 */
describe('core + db + services integration', () => {
  it('a buy then a sell round-trips through storage with exact allocation and gain', () => {
    const db = openTestDatabase();
    runMigrations(db);
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');

    const lot = addLot(db, {
      symbolId: symbol.id,
      buyDate: '2026-01-01',
      priceUsd: new Decimal('142.35'),
      qty: new Decimal('10'),
      fxRateUsdThb: new Decimal('36.21'),
      evidenceFile: null,
    });

    const sale = addSale(db, {
      symbolId: symbol.id,
      sellDate: '2026-06-01',
      qtySold: new Decimal('4'),
      salePriceUsd: new Decimal('150'),
      feeUsd: new Decimal('0'),
      fxRateUsdThb: new Decimal('36'),
      evidenceFile: null,
    });

    const allocationRows = listAllocations(db, { saleId: sale.id });
    const allocations: Allocation[] = allocationRows.map((row) => ({
      saleId: row.saleId,
      lotId: row.lotId,
      qtyAllocated: fromStored(row.qtyAllocated),
      costBasisThb: fromStored(row.costBasisThb),
    }));

    const lotRow = listLots(db, symbol.id)[0]!;
    const domainLot = {
      id: lotRow.id,
      symbolId: lotRow.symbolId,
      buyDate: lotRow.buyDate,
      priceUsd: fromStored(lotRow.priceUsd),
      qty: fromStored(lotRow.qty),
      fxRateUsdThb: fromStored(lotRow.fxRateUsdThb),
      createdAt: lotRow.createdAt,
      evidenceFile: lotRow.evidenceFile,
    };

    // 10 - 4 = 6 remaining on the lot, exactly.
    expect(lotQtyRemaining(domainLot, allocations).equals(new Decimal('6'))).toBe(true);

    const saleRow = listSales(db, symbol.id)[0]!;
    const domainSale = {
      id: saleRow.id,
      symbolId: saleRow.symbolId,
      sellDate: saleRow.sellDate,
      qtySold: fromStored(saleRow.qtySold),
      salePriceUsd: fromStored(saleRow.salePriceUsd),
      feeUsd: fromStored(saleRow.feeUsd),
      fxRateUsdThb: fromStored(saleRow.fxRateUsdThb),
      createdAt: saleRow.createdAt,
      evidenceFile: saleRow.evidenceFile,
    };

    // proceeds = 4*150*36 = 21600 (sale's own FX rate)
    // cost basis per allocation uses the LOT's FX rate, never the sale's:
    // 4 * 142.35 * 36.21 = 20617.974 -> stored at 4dp = 20617.9740
    expect(allocationRows[0]!.costBasisThb).toBe('20617.9740');
    const gain = saleCapitalGainThb(domainSale, allocations);
    expect(gain.equals(new Decimal('21600').minus('20617.9740'))).toBe(true);
  });

  it('deleting the sale clears its allocation and the lot returns to full quantity', () => {
    const db = openTestDatabase();
    runMigrations(db);
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    addLot(db, {
      symbolId: symbol.id, buyDate: '2026-01-01', priceUsd: new Decimal('100'),
      qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null,
    });
    const sale = addSale(db, {
      symbolId: symbol.id, sellDate: '2026-06-01', qtySold: new Decimal('4'),
      salePriceUsd: new Decimal('150'), feeUsd: new Decimal('0'),
      fxRateUsdThb: new Decimal('36'), evidenceFile: null,
    });

    deleteSale(db, sale.id);

    expect(listAllocations(db)).toHaveLength(0);
    const lotRow = listLots(db, symbol.id)[0]!;
    expect(lotQtyRemaining(
      {
        id: lotRow.id, symbolId: lotRow.symbolId, buyDate: lotRow.buyDate,
        priceUsd: fromStored(lotRow.priceUsd), qty: fromStored(lotRow.qty),
        fxRateUsdThb: fromStored(lotRow.fxRateUsdThb), createdAt: lotRow.createdAt,
        evidenceFile: lotRow.evidenceFile,
      },
      [],
    ).equals(new Decimal('10'))).toBe(true);
  });
});
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/core/__tests__/isolation.test.ts src/services/__tests__/integration.test.ts
git commit -m "test: harden isolation scan and prove the full stack round-trips

Isolation test now also catches require() and dynamic import() of
react/expo/db, not just static 'from' imports, now that src/db/ exists
as something core/ could accidentally reach into.

The integration test proves a Decimal value survives services/ledger.ts
-> db/repo.ts -> SQLite TEXT storage -> core/derive.ts with no precision
lost — the storage round-trip plan 1's final review flagged as untested."
```

---

## What This Plan Deliberately Leaves Out

Each belongs to a later plan, and adding it here would produce code with no consumer yet.

- Any UI, screen, or `expo-router` code — plan 3
- Symbol combo-field UX (searchable, "Add NVDA" inline) — plan 3; this plan only provides the `findOrCreateSymbol` primitive it will call
- Quotes, FX fetching, and caching (`fx_rates`, `quotes` tables are created here but nothing writes to them yet) — plan 4
- Dashboard aggregation across symbols, and resolving how `lotCostThb` relates to summed allocation cost basis for a fully-sold lot (flagged, not resolved, by plan 1's final review) — plan 4
- CSV/PDF report generation — plan 5
- Backup export/import, and the `manifest.json`/checksum-comparison flow — plan 6
- PIN lock and `expo-secure-store` — plan 7

## Definition of Done

- `npm test` passes from a clean checkout of `D:\Python\fifo-tracker-mobile`, including this plan's new suites
- `src/db/` contains `sqlDatabase.ts`, `connection.ts`, `schema.ts`, `repo.ts`, and `__tests__/` (including `testDatabase.ts`)
- `src/services/` contains `ledger.ts` and `__tests__/`
- `src/core/` is unchanged except for the widened isolation test — no core file imports React, Expo, or anything under `src/db`, now checked against both static and dynamic imports
- Every one of `addLot`/`editLot`/`deleteLot`/`addSale`/`editSale`/`deleteSale` rolls back completely on failure, proven by a test for at least the lot and sale cases
- `D:\Python\stock-fifo-web-app` is untouched
