# Mobile Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-TypeScript money and FIFO allocation engine for the standalone Android FIFO stock tracker, in a new project, with no dependency on React, Expo, or a database.

**Architecture:** A new Expo project is scaffolded at `D:\Python\fifo-tracker-mobile`, but this plan only fills in `src/core/` — a layer that imports nothing from React, Expo, or the database. Money is represented with `decimal.js` and persisted as fixed-precision decimal strings. `rebuildAllocations()` is a pure function that replays every sale against every lot oldest-first and returns the resulting allocations; identical input always yields identical output. Everything here runs and is tested under plain Node with no emulator.

**Tech Stack:** Expo SDK (latest), React Native, TypeScript (strict), `decimal.js`, Jest with `ts-jest` under a Node environment.

**Spec:** `D:\Python\stock-fifo-web-app\docs\superpowers\specs\2026-09-12-mobile-standalone-design.md`

This is plan 1 of 8. Plans 2-8 cover persistence and ledger services, the app shell and transaction UI, quotes and dashboard, reports, backup and restore, the PIN lock, and monetization plus Play Store preparation. Each depends on this one.

## Global Constraints

- **Project root:** `D:\Python\fifo-tracker-mobile`. Nothing in this plan writes to `D:\Python\stock-fifo-web-app`. The two projects share no code and no data.
- **Decimal precision:** `Decimal.set({ precision: 28 })`, matching Python's default `Decimal` context.
- **Rounding mode:** `Decimal.ROUND_HALF_EVEN` everywhere. This matches `django.db.backends.utils.format_number`, which quantizes with the default decimal context, so the ported engine produces the same values the Django app produced.
- **Decimal places, fixed and non-negotiable:** `price_usd` 6, `qty` / `qty_sold` / `qty_allocated` 8, `fx_rate_usd_thb` 4, `fee_usd` 4, `cost_basis_thb` 4.
- **Monetary values are never a JavaScript `number`.** Strings in, `Decimal` through, strings out. `number` is permitted only for chart rendering, which is out of scope for this plan.
- **`src/core/` imports nothing from `react`, `react-native`, `expo*`, or `src/db/`.** Enforced by a test in Task 8.
- **Dates** are `'YYYY-MM-DD'` strings. **Timestamps** are ISO 8601 UTC strings.
- **TypeScript strict mode** is on.
- Node 24.18.0 and npm 11.16.0 are installed and confirmed on this machine.

---

### Task 1: Scaffold the project and test runner

**Files:**
- Modify: `D:\Python\fifo-tracker-mobile\` (Expo scaffold merged into the existing repository)
- Modify: `D:\Python\fifo-tracker-mobile\package.json`
- Modify: `D:\Python\fifo-tracker-mobile\tsconfig.json`
- Test: `D:\Python\fifo-tracker-mobile\src\core\__tests__\smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a working `npm test` command, `decimal.js` available as a dependency, and the `src/core/` directory

**Starting state.** The repository already exists at `D:\Python\fifo-tracker-mobile` with
one commit (`594acfe`), and already contains `CLAUDE.md`, `docs/superpowers/specs/`,
`docs/superpowers/plans/`, `docs/reference/`, and
`.claude/skills/fifo-stock-tracker-design-system/`. Do not delete or overwrite any of them.

- [ ] **Step 1: Scaffold Expo into a temporary directory, then merge it in**

`create-expo-app` refuses to run in a directory that already holds files it does not
recognize, so it is run somewhere empty and the result is merged in. None of its output
collides with what is already there.

```bash
cd /d/Python
rm -rf .tmp-fifo-expo
npx create-expo-app@latest .tmp-fifo-expo --template blank-typescript

cd /d/Python/.tmp-fifo-expo
rm -rf .git
cp -r . /d/Python/fifo-tracker-mobile/

cd /d/Python
rm -rf .tmp-fifo-expo
```

Verify the pre-existing material survived:

```bash
cd /d/Python/fifo-tracker-mobile
ls CLAUDE.md package.json tsconfig.json App.tsx
ls docs/superpowers/specs docs/superpowers/plans docs/reference
```

Expected: every path listed, no "No such file" error.

- [ ] **Step 2: Install the engine and test dependencies**

```bash
cd /d/Python/fifo-tracker-mobile
npm install decimal.js
npm install --save-dev jest ts-jest @types/jest
```

- [ ] **Step 3: Configure Jest**

`core/` contains no React and no React Native, so it is tested under plain Node with
`ts-jest` — faster, and it makes the "runs without an emulator" property structural rather
than aspirational. Plan 3 adds the `jest-expo` preset as a second project entry when
component tests first appear; it is not needed yet.

Add to `package.json`, merging into the existing top-level object rather than replacing it:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testMatch": ["<rootDir>/src/**/__tests__/**/*.test.ts"]
  }
}
```

- [ ] **Step 4: Turn on TypeScript strict mode**

Ensure `tsconfig.json` contains:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 5: Keep the reference material out of the build**

`docs/reference/django/` holds Python files that exist only to be read. Nothing should try
to compile, lint, or bundle them. Confirm `tsconfig.json` excludes the whole docs tree:

```json
{
  "exclude": ["node_modules", "docs"]
}
```

- [ ] **Step 6: Write a smoke test**

Create `src/core/__tests__/smoke.test.ts`:

```ts
import Decimal from 'decimal.js';

describe('test runner', () => {
  it('runs TypeScript', () => {
    expect(1 + 1).toBe(2);
  });

  it('has decimal.js, which does not suffer float error', () => {
    expect(new Decimal('0.1').plus('0.2').equals(new Decimal('0.3'))).toBe(true);
    expect(0.1 + 0.2 === 0.3).toBe(false);
  });
});
```

- [ ] **Step 7: Run the smoke test**

Run: `npm test`
Expected: PASS, 2 tests.

- [ ] **Step 8: Commit**

Record the resolved dependency versions in the commit body so the toolchain is reproducible.

```bash
cd /d/Python/fifo-tracker-mobile
node -e "const p=require('./package.json');console.log(JSON.stringify({...p.dependencies,...p.devDependencies},null,2))"
git status --short
git add -A
git commit -m "chore: scaffold Expo project with TypeScript, Jest and decimal.js

Standalone Android FIFO stock tracker. Shares no code with the Django
web app; see docs/superpowers/specs for the design it implements.

core/ is tested with ts-jest under a plain Node environment rather than
jest-expo, so the money-critical layer stays runnable without an
emulator. The jest-expo preset arrives in plan 3 with the first
component tests."
```

Check `git status --short` before staging: only the Expo scaffold, the Jest and TypeScript
config, and the smoke test should appear. If anything under `docs/` shows as modified, the
merge in Step 1 overwrote something it should not have.

---

### Task 2: Decimal storage format

**Files:**
- Create: `D:\Python\fifo-tracker-mobile\src\core\money.ts`
- Test: `D:\Python\fifo-tracker-mobile\src\core\__tests__\money.test.ts`

**Interfaces:**
- Consumes: `decimal.js` from Task 1
- Produces:
  - `DP` — a frozen record of decimal places: `{ price: 6, qty: 8, fxRate: 4, money: 4 }`
  - `toStored(value: Decimal, dp: number): string`
  - `fromStored(text: string): Decimal`

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/money.test.ts`:

```ts
import Decimal from 'decimal.js';
import { DP, toStored, fromStored } from '../money';

describe('DP', () => {
  it('matches the decimal places of the Django model fields', () => {
    expect(DP).toEqual({ price: 6, qty: 8, fxRate: 4, money: 4 });
  });
});

describe('toStored', () => {
  it('pads to the exact number of decimal places', () => {
    expect(toStored(new Decimal('10'), DP.qty)).toBe('10.00000000');
    expect(toStored(new Decimal('142.35'), DP.price)).toBe('142.350000');
    expect(toStored(new Decimal('36.21'), DP.fxRate)).toBe('36.2100');
  });

  it('never produces exponential notation', () => {
    expect(toStored(new Decimal('0.00000001'), DP.qty)).toBe('0.00000001');
    expect(toStored(new Decimal('1e-8'), DP.qty)).toBe('0.00000001');
    expect(toStored(new Decimal('12345678901234'), DP.money)).toBe('12345678901234.0000');
  });

  it('rounds half to even, matching Django format_number', () => {
    expect(toStored(new Decimal('0.00005'), DP.money)).toBe('0.0000');
    expect(toStored(new Decimal('0.00015'), DP.money)).toBe('0.0002');
  });

  it('keeps the sign on negative values', () => {
    expect(toStored(new Decimal('-5.5'), DP.money)).toBe('-5.5000');
  });
});

describe('fromStored', () => {
  it('round-trips through toStored without loss', () => {
    const original = new Decimal('51565.6350');
    expect(fromStored(toStored(original, DP.money)).equals(original)).toBe(true);
  });

  it('reads a stored string back as an exact Decimal', () => {
    expect(fromStored('10.00000000').equals(new Decimal(10))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- money`
Expected: FAIL — `Cannot find module '../money'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/core/money.ts`:

```ts
import Decimal from 'decimal.js';

// Matches Python's default Decimal context, which the Django app relies on.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export const DP = Object.freeze({
  price: 6,
  qty: 8,
  fxRate: 4,
  money: 4,
});

/**
 * Renders a Decimal as the fixed-precision string that goes into SQLite.
 *
 * Fixed decimal places are what make stored values sort and compare
 * correctly as text. toFixed also avoids exponential notation, which
 * toString would emit for very small or very large magnitudes.
 */
export function toStored(value: Decimal, dp: number): string {
  return value.toFixed(dp, Decimal.ROUND_HALF_EVEN);
}

export function fromStored(text: string): Decimal {
  return new Decimal(text);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- money`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/money.ts src/core/__tests__/money.test.ts
git commit -m "feat: add fixed-precision decimal storage format

Money and quantities are stored as TEXT in fixed decimal places rather
than REAL, so SQLite never coerces them through float64. Rounding is
half-even to match how Django quantized the same fields."
```

---

### Task 3: Input parsing and validation

**Files:**
- Modify: `D:\Python\fifo-tracker-mobile\src\core\money.ts`
- Modify: `D:\Python\fifo-tracker-mobile\src\core\__tests__\money.test.ts`

**Interfaces:**
- Consumes: `DP`, `toStored`, `fromStored` from Task 2
- Produces:
  - `class InvalidNumberError extends Error`
  - `parseInput(text: string, dp: number): Decimal` — throws `InvalidNumberError` on anything that is not a plain decimal number

- [ ] **Step 1: Write the failing test**

Append to `src/core/__tests__/money.test.ts`:

```ts
import { parseInput, InvalidNumberError } from '../money';

describe('parseInput', () => {
  it('accepts a plain decimal string', () => {
    expect(parseInput('142.35', DP.price).equals(new Decimal('142.35'))).toBe(true);
  });

  it('accepts an integer string', () => {
    expect(parseInput('10', DP.qty).equals(new Decimal(10))).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(parseInput('  10.5  ', DP.qty).equals(new Decimal('10.5'))).toBe(true);
  });

  it('rejects thousands separators, which some keyboards offer', () => {
    expect(() => parseInput('1,234.5', DP.qty)).toThrow(InvalidNumberError);
  });

  it('rejects an empty or whitespace-only string', () => {
    expect(() => parseInput('', DP.qty)).toThrow(InvalidNumberError);
    expect(() => parseInput('   ', DP.qty)).toThrow(InvalidNumberError);
  });

  it('rejects text', () => {
    expect(() => parseInput('abc', DP.qty)).toThrow(InvalidNumberError);
  });

  it('rejects exponential input, which is never intentional from a user', () => {
    expect(() => parseInput('1e8', DP.qty)).toThrow(InvalidNumberError);
  });

  it('rejects NaN and Infinity spellings', () => {
    expect(() => parseInput('NaN', DP.qty)).toThrow(InvalidNumberError);
    expect(() => parseInput('Infinity', DP.qty)).toThrow(InvalidNumberError);
  });

  it('rejects more decimal places than the field allows, rather than rounding silently', () => {
    expect(() => parseInput('1.123456789', DP.qty)).toThrow(InvalidNumberError);
  });

  it('accepts exactly the allowed number of decimal places', () => {
    expect(parseInput('1.12345678', DP.qty).equals(new Decimal('1.12345678'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- money`
Expected: FAIL — `parseInput` and `InvalidNumberError` are not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/core/money.ts`:

```ts
export class InvalidNumberError extends Error {
  constructor(readonly input: string, reason: string) {
    super(`Invalid number ${JSON.stringify(input)}: ${reason}`);
    this.name = 'InvalidNumberError';
  }
}

// Optional sign, digits, optional fractional part. No exponent, no
// separators. Deliberately stricter than the Decimal constructor: a user
// typing "1e8" or "1,234" made a mistake, and silently accepting it would
// store a quantity they did not intend.
const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

export function parseInput(text: string, dp: number): Decimal {
  const trimmed = text.trim();
  if (trimmed === '') {
    throw new InvalidNumberError(text, 'empty');
  }
  if (!PLAIN_DECIMAL.test(trimmed)) {
    throw new InvalidNumberError(text, 'not a plain decimal number');
  }
  const fraction = trimmed.split('.')[1];
  if (fraction !== undefined && fraction.length > dp) {
    throw new InvalidNumberError(text, `more than ${dp} decimal places`);
  }
  return new Decimal(trimmed);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- money`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/money.ts src/core/__tests__/money.test.ts
git commit -m "feat: validate numeric input strictly at the boundary

Rejects thousands separators, exponents and over-precise input rather
than coercing them, so a mistyped quantity fails loudly instead of being
silently rounded into the ledger."
```

---

### Task 4: Domain types and single-lot allocation

**Files:**
- Create: `D:\Python\fifo-tracker-mobile\src\core\types.ts`
- Create: `D:\Python\fifo-tracker-mobile\src\core\fifo.ts`
- Create: `D:\Python\fifo-tracker-mobile\src\core\__tests__\fifo.test.ts`
- Create: `D:\Python\fifo-tracker-mobile\src\core\__tests__\factories.ts`

**Interfaces:**
- Consumes: `DP`, `toStored` from Task 2
- Produces:
  - `interface Lot { id, symbolId, buyDate, priceUsd, qty, fxRateUsdThb, createdAt, evidenceFile }`
  - `interface Sale { id, symbolId, sellDate, qtySold, salePriceUsd, feeUsd, fxRateUsdThb, createdAt, evidenceFile }`
  - `interface Allocation { saleId, lotId, qtyAllocated, costBasisThb }`
  - `rebuildAllocations(lots: readonly Lot[], sales: readonly Sale[]): Allocation[]`
  - test factories `makeLot(...)` and `makeSale(...)`

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/factories.ts`:

```ts
import Decimal from 'decimal.js';
import type { Lot, Sale } from '../types';

let nextId = 1;

export function resetIds(): void {
  nextId = 1;
}

export function makeLot(overrides: Partial<Lot> = {}): Lot {
  const id = overrides.id ?? nextId++;
  return {
    id,
    symbolId: 1,
    buyDate: '2026-01-01',
    priceUsd: new Decimal('100'),
    qty: new Decimal('10'),
    fxRateUsdThb: new Decimal('36'),
    createdAt: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`,
    evidenceFile: null,
    ...overrides,
  };
}

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  const id = overrides.id ?? nextId++;
  return {
    id,
    symbolId: 1,
    sellDate: '2026-06-01',
    qtySold: new Decimal('5'),
    salePriceUsd: new Decimal('150'),
    feeUsd: new Decimal('0'),
    fxRateUsdThb: new Decimal('36'),
    createdAt: `2026-06-01T00:00:${String(id).padStart(2, '0')}Z`,
    evidenceFile: null,
    ...overrides,
  };
}
```

Create `src/core/__tests__/fifo.test.ts`:

```ts
import Decimal from 'decimal.js';
import { rebuildAllocations } from '../fifo';
import { makeLot, makeSale, resetIds } from './factories';

beforeEach(resetIds);

describe('rebuildAllocations — single lot', () => {
  it('returns no allocations when there are no sales', () => {
    expect(rebuildAllocations([makeLot()], [])).toEqual([]);
  });

  it('draws a sale entirely from one lot that covers it', () => {
    const lot = makeLot({ id: 1, qty: new Decimal('10') });
    const sale = makeSale({ id: 2, qtySold: new Decimal('4') });

    const allocations = rebuildAllocations([lot], [sale]);

    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.saleId).toBe(2);
    expect(allocations[0]!.lotId).toBe(1);
    expect(allocations[0]!.qtyAllocated.equals(new Decimal('4'))).toBe(true);
  });

  it('computes cost basis as qty * lot price * the lot FX rate, not the sale FX rate', () => {
    const lot = makeLot({
      id: 1,
      qty: new Decimal('10'),
      priceUsd: new Decimal('142.35'),
      fxRateUsdThb: new Decimal('36.21'),
    });
    const sale = makeSale({
      id: 2,
      qtySold: new Decimal('10'),
      fxRateUsdThb: new Decimal('39.99'),
    });

    const [allocation] = rebuildAllocations([lot], [sale]);

    // 10 * 142.35 * 36.21 = 51544.935 (not 10 * 142.35 * 39.99)
    expect(allocation!.costBasisThb.equals(new Decimal('51544.935'))).toBe(true);
  });

  it('rounds cost basis to 4 decimal places', () => {
    const lot = makeLot({
      id: 1,
      qty: new Decimal('1'),
      priceUsd: new Decimal('0.123456'),
      fxRateUsdThb: new Decimal('1.2345'),
    });
    const sale = makeSale({ id: 2, qtySold: new Decimal('1') });

    const [allocation] = rebuildAllocations([lot], [sale]);

    // 0.123456 * 1.2345 = 0.152406432, half-even to 4 dp = 0.1524
    expect(allocation!.costBasisThb.equals(new Decimal('0.1524'))).toBe(true);
  });

  it('leaves the remainder of a partly consumed lot alone', () => {
    const lot = makeLot({ id: 1, qty: new Decimal('10') });
    const first = makeSale({ id: 2, qtySold: new Decimal('4') });
    const second = makeSale({ id: 3, qtySold: new Decimal('6') });

    const allocations = rebuildAllocations([lot], [first, second]);

    expect(allocations).toHaveLength(2);
    expect(allocations[1]!.qtyAllocated.equals(new Decimal('6'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- fifo`
Expected: FAIL — `Cannot find module '../fifo'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/core/types.ts`:

```ts
import type Decimal from 'decimal.js';

export interface Symbol {
  id: number;
  ticker: string;
  name: string;
}

/** One BUY transaction. */
export interface Lot {
  id: number;
  symbolId: number;
  /** 'YYYY-MM-DD' */
  buyDate: string;
  priceUsd: Decimal;
  qty: Decimal;
  fxRateUsdThb: Decimal;
  /** ISO 8601 UTC */
  createdAt: string;
  evidenceFile: string | null;
}

/** One SELL transaction. */
export interface Sale {
  id: number;
  symbolId: number;
  /** 'YYYY-MM-DD' */
  sellDate: string;
  qtySold: Decimal;
  salePriceUsd: Decimal;
  feeUsd: Decimal;
  fxRateUsdThb: Decimal;
  /** ISO 8601 UTC */
  createdAt: string;
  evidenceFile: string | null;
}

/** Which lot a sale drew from, and how much it took. Always derived. */
export interface Allocation {
  saleId: number;
  lotId: number;
  qtyAllocated: Decimal;
  costBasisThb: Decimal;
}
```

Create `src/core/fifo.ts`:

```ts
import Decimal from 'decimal.js';
import { DP } from './money';
import type { Allocation, Lot, Sale } from './types';

/**
 * Replays every sale against every lot, oldest lot first, and returns the
 * allocations that result.
 *
 * Pure: no database, no clock, no I/O. The same input always produces the
 * same output, which is what lets the caller throw allocations away and
 * rebuild them after any edit or import.
 *
 * Inputs are sorted here rather than trusted to arrive sorted — the sort
 * order IS the FIFO rule, so it belongs with the algorithm.
 */
export function rebuildAllocations(
  lots: readonly Lot[],
  sales: readonly Sale[],
): Allocation[] {
  const orderedLots = [...lots].sort(byLotOrder);
  const orderedSales = [...sales].sort(bySaleOrder);

  const remaining = new Map<number, Decimal>(
    orderedLots.map((lot) => [lot.id, lot.qty]),
  );
  const allocations: Allocation[] = [];

  for (const sale of orderedSales) {
    let outstanding = sale.qtySold;

    for (const lot of orderedLots) {
      if (outstanding.lessThanOrEqualTo(0)) break;
      if (lot.symbolId !== sale.symbolId) continue;

      const available = remaining.get(lot.id)!;
      if (available.lessThanOrEqualTo(0)) continue;

      const take = Decimal.min(available, outstanding);
      allocations.push({
        saleId: sale.id,
        lotId: lot.id,
        qtyAllocated: take,
        costBasisThb: take
          .times(lot.priceUsd)
          .times(lot.fxRateUsdThb)
          .toDecimalPlaces(DP.money, Decimal.ROUND_HALF_EVEN),
      });
      remaining.set(lot.id, available.minus(take));
      outstanding = outstanding.minus(take);
    }
  }

  return allocations;
}

function byLotOrder(a: Lot, b: Lot): number {
  return (
    compare(a.buyDate, b.buyDate) ||
    compare(a.createdAt, b.createdAt) ||
    a.id - b.id
  );
}

function bySaleOrder(a: Sale, b: Sale): number {
  return (
    compare(a.sellDate, b.sellDate) ||
    compare(a.createdAt, b.createdAt) ||
    a.id - b.id
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- fifo`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/fifo.ts src/core/__tests__/fifo.test.ts src/core/__tests__/factories.ts
git commit -m "feat: add FIFO allocation over a single lot

Cost basis uses the FX rate captured on the buying lot, never the selling
rate, so historical cost stays correct regardless of today's exchange rate."
```

---

### Task 5: Multi-lot spanning and FIFO ordering

**Files:**
- Modify: `D:\Python\fifo-tracker-mobile\src\core\__tests__\fifo.test.ts`

No implementation change is expected — Task 4's loop already handles these cases. These tests pin the behavior that the rest of the app depends on. If any fails, fix `fifo.ts` rather than the test.

**Interfaces:**
- Consumes: `rebuildAllocations`, factories from Task 4
- Produces: nothing new

- [ ] **Step 1: Write the tests**

Append to `src/core/__tests__/fifo.test.ts`:

```ts
describe('rebuildAllocations — multiple lots', () => {
  it('spans one sale across several lots, oldest first', () => {
    const a = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('3') });
    const b = makeLot({ id: 2, buyDate: '2026-02-01', qty: new Decimal('3') });
    const c = makeLot({ id: 3, buyDate: '2026-03-01', qty: new Decimal('3') });
    const sale = makeSale({ id: 4, qtySold: new Decimal('7') });

    const allocations = rebuildAllocations([a, b, c], [sale]);

    expect(allocations.map((x) => x.lotId)).toEqual([1, 2, 3]);
    expect(allocations.map((x) => x.qtyAllocated.toString())).toEqual(['3', '3', '1']);
  });

  it('consumes the oldest lot first regardless of input array order', () => {
    const newer = makeLot({ id: 1, buyDate: '2026-05-01', qty: new Decimal('5') });
    const older = makeLot({ id: 2, buyDate: '2026-01-01', qty: new Decimal('5') });
    const sale = makeSale({ id: 3, qtySold: new Decimal('5') });

    const allocations = rebuildAllocations([newer, older], [sale]);

    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.lotId).toBe(2);
  });

  it('skips a lot that earlier sales already exhausted', () => {
    const a = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('5') });
    const b = makeLot({ id: 2, buyDate: '2026-02-01', qty: new Decimal('5') });
    const first = makeSale({ id: 3, sellDate: '2026-06-01', qtySold: new Decimal('5') });
    const second = makeSale({ id: 4, sellDate: '2026-07-01', qtySold: new Decimal('5') });

    const allocations = rebuildAllocations([a, b], [first, second]);

    expect(allocations).toHaveLength(2);
    expect(allocations[0]!.lotId).toBe(1);
    expect(allocations[1]!.lotId).toBe(2);
  });

  it('breaks a same-day tie by created_at, then by id', () => {
    const later = makeLot({
      id: 1, buyDate: '2026-01-01', createdAt: '2026-01-01T10:00:00Z', qty: new Decimal('1'),
    });
    const earlier = makeLot({
      id: 2, buyDate: '2026-01-01', createdAt: '2026-01-01T09:00:00Z', qty: new Decimal('1'),
    });
    const sale = makeSale({ id: 3, qtySold: new Decimal('1') });

    expect(rebuildAllocations([later, earlier], [sale])[0]!.lotId).toBe(2);
  });

  it('falls back to id when buy_date and created_at are both identical', () => {
    const stamp = '2026-01-01T00:00:00Z';
    const second = makeLot({ id: 9, buyDate: '2026-01-01', createdAt: stamp, qty: new Decimal('1') });
    const first = makeLot({ id: 4, buyDate: '2026-01-01', createdAt: stamp, qty: new Decimal('1') });
    const sale = makeSale({ id: 10, qtySold: new Decimal('1') });

    expect(rebuildAllocations([second, first], [sale])[0]!.lotId).toBe(4);
  });

  it('applies sales in date order even when passed out of order', () => {
    const lot = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('10') });
    const later = makeSale({ id: 2, sellDate: '2026-08-01', qtySold: new Decimal('4') });
    const earlier = makeSale({ id: 3, sellDate: '2026-07-01', qtySold: new Decimal('6') });

    const allocations = rebuildAllocations([lot], [later, earlier]);

    expect(allocations.map((x) => x.saleId)).toEqual([3, 2]);
  });
});

describe('rebuildAllocations — symbol isolation', () => {
  it('never allocates a lot of one symbol to a sale of another', () => {
    const nvda = makeLot({ id: 1, symbolId: 1, qty: new Decimal('10') });
    const tsla = makeLot({ id: 2, symbolId: 2, qty: new Decimal('10') });
    const sellTsla = makeSale({ id: 3, symbolId: 2, qtySold: new Decimal('10') });

    const allocations = rebuildAllocations([nvda, tsla], [sellTsla]);

    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.lotId).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- fifo`
Expected: PASS, 12 tests.

- [ ] **Step 3: Commit**

```bash
git add src/core/__tests__/fifo.test.ts
git commit -m "test: pin FIFO ordering, lot spanning and symbol isolation

Covers the multi-lot case the spreadsheet could not express: one sale
drawing from several lots at different cost bases."
```

---

### Task 6: The buy-date rule and insufficient lots

**Files:**
- Modify: `D:\Python\fifo-tracker-mobile\src\core\fifo.ts`
- Modify: `D:\Python\fifo-tracker-mobile\src\core\__tests__\fifo.test.ts`

**Interfaces:**
- Consumes: `rebuildAllocations` from Task 4
- Produces: `class InsufficientLotsError extends Error` carrying `saleId`, `symbolId`, `sellDate`, `requested: Decimal`, `available: Decimal`

The error carries structured fields rather than a formatted sentence. `core/` does not know tickers — a `Lot` holds a `symbolId`, not a name — and the UI needs to render this message in Thai. Formatting belongs to the caller.

- [ ] **Step 1: Write the failing test**

Append to `src/core/__tests__/fifo.test.ts`:

```ts
import { InsufficientLotsError } from '../fifo';

describe('rebuildAllocations — the buy-date rule', () => {
  it('refuses to draw from a lot bought after the sale date', () => {
    const future = makeLot({ id: 1, buyDate: '2026-05-01', qty: new Decimal('10') });
    const sale = makeSale({ id: 2, sellDate: '2026-03-01', qtySold: new Decimal('1') });

    expect(() => rebuildAllocations([future], [sale])).toThrow(InsufficientLotsError);
  });

  it('allows a lot bought on the same day as the sale', () => {
    const sameDay = makeLot({ id: 1, buyDate: '2026-03-01', qty: new Decimal('10') });
    const sale = makeSale({ id: 2, sellDate: '2026-03-01', qtySold: new Decimal('1') });

    expect(rebuildAllocations([sameDay], [sale])).toHaveLength(1);
  });

  it('skips a future lot but still uses an eligible older one', () => {
    const eligible = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('4') });
    const future = makeLot({ id: 2, buyDate: '2026-05-01', qty: new Decimal('99') });
    const sale = makeSale({ id: 3, sellDate: '2026-03-01', qtySold: new Decimal('4') });

    const allocations = rebuildAllocations([eligible, future], [sale]);

    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.lotId).toBe(1);
  });
});

describe('InsufficientLotsError', () => {
  it('reports what was requested and what was actually held on that date', () => {
    const lot = makeLot({ id: 1, symbolId: 7, buyDate: '2026-01-01', qty: new Decimal('4') });
    const sale = makeSale({
      id: 2, symbolId: 7, sellDate: '2026-03-01', qtySold: new Decimal('10'),
    });

    try {
      rebuildAllocations([lot], [sale]);
      throw new Error('expected rebuildAllocations to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientLotsError);
      const insufficient = error as InsufficientLotsError;
      expect(insufficient.saleId).toBe(2);
      expect(insufficient.symbolId).toBe(7);
      expect(insufficient.sellDate).toBe('2026-03-01');
      expect(insufficient.requested.equals(new Decimal('10'))).toBe(true);
      expect(insufficient.available.equals(new Decimal('4'))).toBe(true);
    }
  });

  it('counts only quantity left after earlier sales as available', () => {
    const lot = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('10') });
    const first = makeSale({ id: 2, sellDate: '2026-02-01', qtySold: new Decimal('8') });
    const second = makeSale({ id: 3, sellDate: '2026-03-01', qtySold: new Decimal('5') });

    try {
      rebuildAllocations([lot], [first, second]);
      throw new Error('expected rebuildAllocations to throw');
    } catch (error) {
      const insufficient = error as InsufficientLotsError;
      expect(insufficient.saleId).toBe(3);
      expect(insufficient.available.equals(new Decimal('2'))).toBe(true);
    }
  });

  it('allocates nothing at all when a sale cannot be covered', () => {
    const lot = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('1') });
    const sale = makeSale({ id: 2, sellDate: '2026-02-01', qtySold: new Decimal('5') });

    expect(() => rebuildAllocations([lot], [sale])).toThrow(InsufficientLotsError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- fifo`
Expected: FAIL — `InsufficientLotsError` is not exported, and the future-lot test allocates instead of throwing.

- [ ] **Step 3: Write the implementation**

In `src/core/fifo.ts`, add the error class after the imports:

```ts
/**
 * A sale could not be covered by the lots held on its sale date.
 *
 * Carries structured fields rather than a sentence: core has no access to
 * ticker names, and the message has to be rendered in the user's language.
 */
export class InsufficientLotsError extends Error {
  constructor(
    readonly saleId: number,
    readonly symbolId: number,
    readonly sellDate: string,
    readonly requested: Decimal,
    readonly available: Decimal,
  ) {
    super(
      `Sale ${saleId} of symbol ${symbolId} on ${sellDate} requested ` +
        `${requested.toString()} but only ${available.toString()} was held`,
    );
    this.name = 'InsufficientLotsError';
  }
}
```

Then replace the body of the `for (const sale of orderedSales)` loop with:

```ts
  for (const sale of orderedSales) {
    let outstanding = sale.qtySold;
    const drafted: Allocation[] = [];

    for (const lot of orderedLots) {
      if (outstanding.lessThanOrEqualTo(0)) break;
      if (lot.symbolId !== sale.symbolId) continue;
      // You cannot sell what you did not yet own. The Django app never
      // checked this, which let a mistyped year silently draw cost basis
      // from a lot bought after the sale.
      if (lot.buyDate > sale.sellDate) continue;

      const available = remaining.get(lot.id)!;
      if (available.lessThanOrEqualTo(0)) continue;

      const take = Decimal.min(available, outstanding);
      drafted.push({
        saleId: sale.id,
        lotId: lot.id,
        qtyAllocated: take,
        costBasisThb: take
          .times(lot.priceUsd)
          .times(lot.fxRateUsdThb)
          .toDecimalPlaces(DP.money, Decimal.ROUND_HALF_EVEN),
      });
      remaining.set(lot.id, available.minus(take));
      outstanding = outstanding.minus(take);
    }

    if (outstanding.greaterThan(0)) {
      throw new InsufficientLotsError(
        sale.id,
        sale.symbolId,
        sale.sellDate,
        sale.qtySold,
        sale.qtySold.minus(outstanding),
      );
    }

    allocations.push(...drafted);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- fifo`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/fifo.ts src/core/__tests__/fifo.test.ts
git commit -m "feat: reject sales that exceed the holding on their sale date

A sale may now only draw from lots bought on or before it. This diverges
deliberately from the Django app, which filtered by symbol alone and so
would happily allocate a future purchase to a past sale — turning a
mistyped year into a silently wrong cost basis."
```

---

### Task 7: Derived values

**Files:**
- Create: `D:\Python\fifo-tracker-mobile\src\core\derive.ts`
- Create: `D:\Python\fifo-tracker-mobile\src\core\__tests__\derive.test.ts`

These are the Django model properties — `qty_remaining`, `cost_thb`, `proceeds_thb`, `capital_gain_thb` — reimplemented as pure functions over already-loaded rows. They exist here, not in the database layer, because summing `TEXT` columns in SQL would coerce through float64.

**Interfaces:**
- Consumes: `Lot`, `Sale`, `Allocation` from Task 4; `DP` from Task 2
- Produces:
  - `lotQtyRemaining(lot: Lot, allocations: readonly Allocation[]): Decimal`
  - `lotCostThb(lot: Lot): Decimal`
  - `saleProceedsThb(sale: Sale): Decimal`
  - `saleCostBasisThb(sale: Sale, allocations: readonly Allocation[]): Decimal`
  - `saleCapitalGainThb(sale: Sale, allocations: readonly Allocation[]): Decimal`

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/derive.test.ts`:

```ts
import Decimal from 'decimal.js';
import {
  lotQtyRemaining,
  lotCostThb,
  saleProceedsThb,
  saleCostBasisThb,
  saleCapitalGainThb,
} from '../derive';
import { rebuildAllocations } from '../fifo';
import { makeLot, makeSale, resetIds } from './factories';

beforeEach(resetIds);

describe('lotQtyRemaining', () => {
  it('is the full quantity when nothing has been allocated', () => {
    const lot = makeLot({ id: 1, qty: new Decimal('10') });
    expect(lotQtyRemaining(lot, []).equals(new Decimal('10'))).toBe(true);
  });

  it('subtracts every allocation drawn from this lot', () => {
    const lot = makeLot({ id: 1, qty: new Decimal('10') });
    const sale = makeSale({ id: 2, qtySold: new Decimal('4') });
    const allocations = rebuildAllocations([lot], [sale]);

    expect(lotQtyRemaining(lot, allocations).equals(new Decimal('6'))).toBe(true);
  });

  it('ignores allocations belonging to other lots', () => {
    const a = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('5') });
    const b = makeLot({ id: 2, buyDate: '2026-02-01', qty: new Decimal('5') });
    const sale = makeSale({ id: 3, qtySold: new Decimal('5') });
    const allocations = rebuildAllocations([a, b], [sale]);

    expect(lotQtyRemaining(b, allocations).equals(new Decimal('5'))).toBe(true);
  });

  it('reaches exactly zero for a fully consumed lot, never a tiny residue', () => {
    const lot = makeLot({ id: 1, qty: new Decimal('0.1') });
    const first = makeSale({ id: 2, sellDate: '2026-06-01', qtySold: new Decimal('0.05') });
    const second = makeSale({ id: 3, sellDate: '2026-07-01', qtySold: new Decimal('0.05') });
    const allocations = rebuildAllocations([lot], [first, second]);

    expect(lotQtyRemaining(lot, allocations).isZero()).toBe(true);
  });
});

describe('lotCostThb', () => {
  it('is price * qty * the lot FX rate', () => {
    const lot = makeLot({
      qty: new Decimal('10'),
      priceUsd: new Decimal('142.35'),
      fxRateUsdThb: new Decimal('36.21'),
    });
    expect(lotCostThb(lot).equals(new Decimal('51544.935'))).toBe(true);
  });
});

describe('saleProceedsThb', () => {
  it('subtracts the fee in USD before converting to THB', () => {
    const sale = makeSale({
      qtySold: new Decimal('10'),
      salePriceUsd: new Decimal('150'),
      feeUsd: new Decimal('5'),
      fxRateUsdThb: new Decimal('36'),
    });
    // (150 * 10 - 5) * 36 = 53820
    expect(saleProceedsThb(sale).equals(new Decimal('53820'))).toBe(true);
  });
});

describe('saleCapitalGainThb', () => {
  it('is proceeds minus the cost basis of the lots it consumed', () => {
    const lot = makeLot({
      id: 1,
      buyDate: '2026-01-01',
      qty: new Decimal('10'),
      priceUsd: new Decimal('100'),
      fxRateUsdThb: new Decimal('36'),
    });
    const sale = makeSale({
      id: 2,
      sellDate: '2026-06-01',
      qtySold: new Decimal('10'),
      salePriceUsd: new Decimal('150'),
      feeUsd: new Decimal('0'),
      fxRateUsdThb: new Decimal('36'),
    });
    const allocations = rebuildAllocations([lot], [sale]);

    // cost 10*100*36 = 36000, proceeds 10*150*36 = 54000
    expect(saleCostBasisThb(sale, allocations).equals(new Decimal('36000'))).toBe(true);
    expect(saleCapitalGainThb(sale, allocations).equals(new Decimal('18000'))).toBe(true);
  });

  it('is negative on a loss', () => {
    const lot = makeLot({
      id: 1, buyDate: '2026-01-01', qty: new Decimal('1'),
      priceUsd: new Decimal('200'), fxRateUsdThb: new Decimal('36'),
    });
    const sale = makeSale({
      id: 2, sellDate: '2026-06-01', qtySold: new Decimal('1'),
      salePriceUsd: new Decimal('100'), feeUsd: new Decimal('0'),
      fxRateUsdThb: new Decimal('36'),
    });
    const allocations = rebuildAllocations([lot], [sale]);

    expect(saleCapitalGainThb(sale, allocations).isNegative()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- derive`
Expected: FAIL — `Cannot find module '../derive'`.

- [ ] **Step 3: Write the implementation**

Create `src/core/derive.ts`:

```ts
import Decimal from 'decimal.js';
import { DP } from './money';
import type { Allocation, Lot, Sale } from './types';

/**
 * Values the Django app exposed as model properties. They live here rather
 * than in SQL because SUM() over a TEXT column coerces through float64,
 * which is exactly the precision loss the TEXT storage exists to avoid.
 *
 * Callers pass the allocation rows they already loaded; these functions
 * never query.
 */

export function lotQtyRemaining(lot: Lot, allocations: readonly Allocation[]): Decimal {
  return allocations
    .filter((allocation) => allocation.lotId === lot.id)
    .reduce((left, allocation) => left.minus(allocation.qtyAllocated), lot.qty);
}

export function lotCostThb(lot: Lot): Decimal {
  return lot.priceUsd
    .times(lot.qty)
    .times(lot.fxRateUsdThb)
    .toDecimalPlaces(DP.money, Decimal.ROUND_HALF_EVEN);
}

export function saleProceedsThb(sale: Sale): Decimal {
  return sale.salePriceUsd
    .times(sale.qtySold)
    .minus(sale.feeUsd)
    .times(sale.fxRateUsdThb)
    .toDecimalPlaces(DP.money, Decimal.ROUND_HALF_EVEN);
}

export function saleCostBasisThb(sale: Sale, allocations: readonly Allocation[]): Decimal {
  return allocations
    .filter((allocation) => allocation.saleId === sale.id)
    .reduce((total, allocation) => total.plus(allocation.costBasisThb), new Decimal(0));
}

export function saleCapitalGainThb(sale: Sale, allocations: readonly Allocation[]): Decimal {
  return saleProceedsThb(sale).minus(saleCostBasisThb(sale, allocations));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- derive`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/derive.ts src/core/__tests__/derive.test.ts
git commit -m "feat: add derived lot and sale values as pure functions

Ports the Django model properties. Kept out of SQL because SUM() over a
TEXT column silently coerces to float."
```

---

### Task 8: Invariants and layer isolation

**Files:**
- Create: `D:\Python\fifo-tracker-mobile\src\core\__tests__\invariants.test.ts`
- Create: `D:\Python\fifo-tracker-mobile\src\core\__tests__\isolation.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2-7
- Produces: nothing new — this task locks in guarantees the later plans rely on

- [ ] **Step 1: Write the invariant tests**

Create `src/core/__tests__/invariants.test.ts`:

```ts
import Decimal from 'decimal.js';
import { rebuildAllocations, InsufficientLotsError } from '../fifo';
import { lotQtyRemaining } from '../derive';
import type { Lot, Sale } from '../types';
import { makeLot, makeSale, resetIds } from './factories';

beforeEach(resetIds);

/**
 * A tiny deterministic generator. Seeded so a failure is reproducible from
 * the printed seed rather than being a flaky one-off.
 */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function buildScenario(seed: number): { lots: Lot[]; sales: Sale[] } {
  const random = makeRandom(seed);
  const lots: Lot[] = [];
  const sales: Sale[] = [];
  let id = 1;
  let held = new Decimal(0);

  for (let month = 1; month <= 8; month++) {
    const date = `2026-${String(month).padStart(2, '0')}-01`;

    const qty = new Decimal(Math.floor(random() * 100) + 1).dividedBy(4);
    lots.push(makeLot({
      id: id++,
      buyDate: date,
      createdAt: `${date}T00:00:00Z`,
      qty,
      priceUsd: new Decimal(Math.floor(random() * 50000) / 100 + 1),
      fxRateUsdThb: new Decimal(Math.floor(random() * 1000) / 100 + 30),
    }));
    held = held.plus(qty);

    if (random() > 0.4 && held.greaterThan(0)) {
      const sold = held.times(Math.floor(random() * 80) / 100).toDecimalPlaces(8);
      if (sold.greaterThan(0)) {
        sales.push(makeSale({
          id: id++,
          sellDate: date,
          createdAt: `${date}T12:00:00Z`,
          qtySold: sold,
          salePriceUsd: new Decimal(Math.floor(random() * 50000) / 100 + 1),
          fxRateUsdThb: new Decimal(Math.floor(random() * 1000) / 100 + 30),
          feeUsd: new Decimal(0),
        }));
        held = held.minus(sold);
      }
    }
  }

  return { lots, sales };
}

describe('invariants over generated ledgers', () => {
  const seeds = [1, 2, 3, 7, 11, 42, 99, 123, 2026, 31337];

  it.each(seeds)('allocates exactly the quantity sold (seed %i)', (seed) => {
    const { lots, sales } = buildScenario(seed);
    const allocations = rebuildAllocations(lots, sales);

    const allocated = allocations.reduce((t, a) => t.plus(a.qtyAllocated), new Decimal(0));
    const sold = sales.reduce((t, s) => t.plus(s.qtySold), new Decimal(0));

    expect(allocated.equals(sold)).toBe(true);
  });

  it.each(seeds)('never over-allocates a lot (seed %i)', (seed) => {
    const { lots, sales } = buildScenario(seed);
    const allocations = rebuildAllocations(lots, sales);

    for (const lot of lots) {
      expect(lotQtyRemaining(lot, allocations).isNegative()).toBe(false);
    }
  });

  it.each(seeds)('never draws from a lot bought after the sale (seed %i)', (seed) => {
    const { lots, sales } = buildScenario(seed);
    const allocations = rebuildAllocations(lots, sales);

    const lotById = new Map(lots.map((lot) => [lot.id, lot]));
    const saleById = new Map(sales.map((sale) => [sale.id, sale]));

    for (const allocation of allocations) {
      const lot = lotById.get(allocation.lotId)!;
      const sale = saleById.get(allocation.saleId)!;
      expect(lot.buyDate <= sale.sellDate).toBe(true);
    }
  });

  it.each(seeds)('produces identical output when run twice (seed %i)', (seed) => {
    const { lots, sales } = buildScenario(seed);

    const first = rebuildAllocations(lots, sales);
    const second = rebuildAllocations(lots, sales);

    const serialize = (allocations: ReturnType<typeof rebuildAllocations>) =>
      allocations.map((a) => [a.saleId, a.lotId, a.qtyAllocated.toString(), a.costBasisThb.toString()]);

    expect(serialize(first)).toEqual(serialize(second));
  });

  it.each(seeds)('is unaffected by the order of the input arrays (seed %i)', (seed) => {
    const { lots, sales } = buildScenario(seed);

    const forward = rebuildAllocations(lots, sales);
    const reversed = rebuildAllocations([...lots].reverse(), [...sales].reverse());

    const serialize = (allocations: ReturnType<typeof rebuildAllocations>) =>
      allocations.map((a) => [a.saleId, a.lotId, a.qtyAllocated.toString()]);

    expect(serialize(forward)).toEqual(serialize(reversed));
  });

  it('does not mutate the arrays it is given', () => {
    const { lots, sales } = buildScenario(42);
    const lotIds = lots.map((lot) => lot.id);
    const saleIds = sales.map((sale) => sale.id);

    rebuildAllocations(lots, sales);

    expect(lots.map((lot) => lot.id)).toEqual(lotIds);
    expect(sales.map((sale) => sale.id)).toEqual(saleIds);
  });

  it('reports the failing sale rather than a generic error when a ledger is inconsistent', () => {
    const lot = makeLot({ id: 1, buyDate: '2026-01-01', qty: new Decimal('1') });
    const ok = makeSale({ id: 2, sellDate: '2026-02-01', qtySold: new Decimal('1') });
    const broken = makeSale({ id: 3, sellDate: '2026-03-01', qtySold: new Decimal('1') });

    try {
      rebuildAllocations([lot], [ok, broken]);
      throw new Error('expected rebuildAllocations to throw');
    } catch (error) {
      expect((error as InsufficientLotsError).saleId).toBe(3);
    }
  });
});
```

- [ ] **Step 2: Run the invariant tests**

Run: `npm test -- invariants`
Expected: PASS, 52 tests.

- [ ] **Step 3: Write the layer isolation test**

Create `src/core/__tests__/isolation.test.ts`:

```ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * core/ must stay runnable under plain Node with no emulator and no
 * database. That property is what makes the money-critical code cheap to
 * test, and it is easy to destroy accidentally with a single import.
 */
const CORE_DIR = join(__dirname, '..');
const FORBIDDEN = [/from ['"]react/, /from ['"]expo/, /from ['"]@expo/, /from ['"]\.\.\/db/];

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

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/core/__tests__/invariants.test.ts src/core/__tests__/isolation.test.ts
git commit -m "test: lock in FIFO invariants and core layer isolation

Property tests over seeded generated ledgers assert that allocated
quantity always equals sold quantity, no lot goes negative, no allocation
predates its lot, and repeated runs are byte-identical — the last being
what lets allocations be discarded and rebuilt after any edit or import.

A source scan keeps core/ free of React, Expo and database imports so it
stays runnable under plain Node."
```

---

## What This Plan Deliberately Leaves Out

Each belongs to a later plan, and adding it here would produce code with no test that can run yet.

- SQLite schema, migrations, and the repository layer — plan 2
- The `ledger` service that calls `rebuildAllocations` inside a transaction — plan 2
- Rendering `InsufficientLotsError` as a Thai sentence with a real ticker — plan 3
- Symbol creation and ticker normalization — plan 3
- Quotes, FX fetching, and caching — plan 4
- Dashboard aggregation across symbols — plan 4
- CSV and PDF report generation — plan 5

## Definition of Done

- `npm test` passes from a clean checkout of `D:\Python\fifo-tracker-mobile`
- `src/core/` contains exactly `money.ts`, `types.ts`, `fifo.ts`, `derive.ts`
- No file in `src/core/` imports React, Expo, or anything under `src/db/`
- The design spec and this plan are committed inside the new project
- `D:\Python\stock-fifo-web-app` is untouched
