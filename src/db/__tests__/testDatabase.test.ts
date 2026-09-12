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
