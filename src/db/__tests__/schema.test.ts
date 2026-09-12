import { openTestDatabase } from './testDatabase';
import { runMigrations, CURRENT_SCHEMA_VERSION } from '../schema';

describe('runMigrations', () => {
  it('creates all six tables', () => {
    const db = openTestDatabase();
    runMigrations(db);
    const tables = db
      .getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
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
    const tables = db.getAllSync("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
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
