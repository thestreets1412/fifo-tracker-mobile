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
