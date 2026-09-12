# Mobile App Shell and Transaction UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Expo Router app shell and the full buy/sell transaction UI — symbol management, lot and sale entry forms, list screens, the signature "which lots did this sale consume" detail screen, and evidence-image attachment — on top of the pure engine (plan 1) and the persistence/ledger services (plan 2).

**Architecture:** The app migrates from the `App.tsx`/`registerRootComponent` entry to **Expo Router** (`src/app/`). A single `zustand` store owns the live `SqlDatabase` handle and a `dataVersion` counter; every mutation bumps it and every list re-queries on change (spec §7.2 — "one small store owns 'reload from database'"). All logic that can be tested without a device is pushed **out of components** into React-free modules under `src/ui/` (form validation, display formatting, the symbol combo filter, the sale-detail view model) and `src/services/` (symbol usage counts, evidence file handling, database bootstrap); these get real Jest tests under plain Node against a real in-memory SQLite, exactly as plans 1–2 did. The React Native screens themselves are verified manually on a device, per spec §10. Visual styling is driven by design tokens ported from the `fifo-stock-tracker-design-system` skill into `src/theme/tokens.ts`.

**Tech Stack:** Expo Router (+ `react-native-safe-area-context`, `react-native-screens`, `expo-linking`, `expo-constants`), `zustand`, `expo-image-picker`, `expo-file-system`, `@react-native-community/datetimepicker`, `expo-font` with `@expo-google-fonts/space-grotesk` and `@expo-google-fonts/ibm-plex-mono`. Jest/ts-jest/TypeScript and `decimal.js`/`better-sqlite3` toolchain from plans 1–2 unchanged.

**Spec:** `D:\Python\fifo-tracker-mobile\docs\superpowers\specs\2026-09-12-mobile-standalone-design.md` (sections 7, 7.1, 7.2, 7.4, 2.4, 3.2, and 10 are load-bearing for this plan).

## Global Constraints

- **Project root:** `D:\Python\fifo-tracker-mobile`. The implementer's working directory **is** the repo root — treat it as such and never `cd` elsewhere. Nothing here writes to `D:\Python\stock-fifo-web-app`.
- **Branch:** this plan executes on the existing `develop` branch (the human created it). Do not start from or merge into `main` without explicit consent.
- **Money never touches a JavaScript `number`** (CLAUDE.md). Form text goes string → `Decimal` (via `core/money.ts`'s `parseInput`); display goes `Decimal` → string (via `src/ui/format.ts`). The only `number` permitted in this plan is React layout/style values and the integer row counts from symbol usage — never a monetary or quantity value.
- **`src/core/` still imports nothing from `react`, `react-native`, `expo*`, or `src/db`** (CLAUDE.md). This plan adds no code to `src/core/`. The isolation test from plan 2 must stay green.
- **`src/ui/*.ts` (not `src/ui/components/`) and the new `src/services/*.ts` modules import nothing from `react`, `react-native`, or `expo*`** — they are the device-independent logic layer and must run under the Node Jest environment. They may import `src/core/`, `src/db/` (types + repo functions), and `src/services/ledger.ts` (type-only for the input types). Enforced by the fact that their `.test.ts` files run under `testEnvironment: node`.
- **Evidence images are stored by filename, never an absolute path** (CLAUDE.md, spec §2.2). The filename written to `lots.evidence_file` / `sales.evidence_file` is a bare basename with no `/`, `\`, or `:` — `services/ledger.ts`'s `validateEvidenceFile` already rejects anything else and will throw if violated.
- **Tickers normalize to uppercase, whitespace trimmed** (spec §7.4). Symbol creation goes exclusively through `repo.createSymbol`/`findOrCreateSymbol`, which already normalize; the UI never inserts a symbol by raw SQL.
- **Symbol validation against the quote endpoint is advisory, never blocking** (spec §7.4). This plan has no network layer yet (quotes are plan 4), so symbol creation in this plan is always offline: the symbol is created immediately and left with an empty `name`, to be backfilled in plan 4. The UI must never block data entry on a lookup.
- **Sales enforce `lot.buy_date <= sale.sell_date`** (spec §3.2). This is already enforced inside `core/fifo.ts` via `rebuildAllocations`, which `ledger.addSale`/`editSale` calls; the UI's job is only to **catch `InsufficientLotsError` and surface its message**, never to re-implement the check.
- **Dates** are `'YYYY-MM-DD'` strings; **timestamps** are ISO 8601 UTC and are set by the ledger service, never by the UI.
- **TypeScript strict mode** stays on (`tsconfig.json` already has `strict` + `noUncheckedIndexedAccess`).
- **App UI language is Thai.** All user-facing screen copy in this plan is Thai. (The PDF/CSV report stays English — plan 5, out of scope here.) Error messages thrown by `core`/`services` are English technical strings; the UI maps the ones users can trigger (insufficient lots, duplicate ticker, invalid number) to Thai copy.
- Node 24.18.0 and npm 11.16.0 are installed and confirmed on this machine (plans 1–2).

## Testing Strategy for This Plan — read before Task 1

This plan departs from pure TDD in a spec-sanctioned way. Spec §10 states: *"Screens — manual verification on a physical device. UI correctness is not claimed from test results."* Accordingly:

- **React-free logic modules** (`src/ui/format.ts`, `src/ui/lotForm.ts`, `src/ui/saleForm.ts`, `src/ui/symbolCombo.ts`, `src/ui/saleDetail.ts`, `src/services/symbols.ts`, `src/services/evidence.ts`'s pure helpers, `src/store/useAppStore.ts`) are built **test-first** with real Jest tests, same rhythm as plans 1–2. These are where the money-touching and gating logic lives, so this is where the test investment goes.
- **React Native components and screens** (`src/ui/components/*.tsx`, `src/app/**/*.tsx`, and the native-module wrappers in `src/services/evidence.ts` / `src/services/appDatabase.ts`) are **not** unit-tested. Their per-task "test" steps are explicit **manual-verification checklists** run with `npx expo start`. Each such step says exactly what to do and what to observe.
- **`npx tsc --noEmit` must pass** after every task — it is the automated gate for the component/screen code, catching interface drift even where there is no runtime test. Add an npm script `typecheck` in Task 1 and run it at the end of every task.
- **`npm test` (the existing Jest suite) must stay green** after every task. No screen is ever imported from a `.test.ts` file, so the Node test environment never loads React Native.

Do not add React Native Testing Library or any component-test harness — the spec deliberately does not claim UI correctness from tests, and that tooling is not worth its weight here.

## File Structure

```
src/
├── theme/
│   └── tokens.ts              color / space / radius / font constants ported from the design-system CSS vars
├── store/
│   └── useAppStore.ts         zustand: { db, dataVersion, setDb, reload }
├── ui/
│   ├── format.ts              Decimal/string → display string (money, qty, usd, signed gain, date)
│   ├── symbolCombo.ts         filterSymbols(query, symbols) → matches / exactMatch / canAdd
│   ├── lotForm.ts             LotFormState → { input: NewLotInput | null, errors }
│   ├── saleForm.ts            SaleFormState → { input: NewSaleInput | null, errors }
│   ├── saleDetail.ts          buildSaleDetail(...) → the signature screen's view model
│   └── components/            React Native presentational components (manual-verified)
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Field.tsx          FormField + TextInput + DecimalInput
│       ├── DateField.tsx      native date picker wrapper
│       ├── GainLoss.tsx
│       ├── Screen.tsx         safe-area page container + header
│       ├── ListRow.tsx
│       ├── EmptyState.tsx
│       └── EvidencePicker.tsx thumbnail + pick/replace/remove control
├── services/
│   ├── appDatabase.ts         initializeDatabase(): open + migrate (native; manual)
│   ├── symbols.ts             listSymbolsWithCounts(db) (tested)
│   └── evidence.ts            generateEvidenceFilename (tested) + pick/store/resolve/delete (native; manual)
└── app/                       Expo Router screens (manual-verified)
    ├── _layout.tsx            root Stack; loads fonts, bootstraps DB into the store
    ├── (tabs)/
    │   ├── _layout.tsx        bottom Tabs
    │   ├── index.tsx          Dashboard — PLACEHOLDER (full build is plan 4)
    │   ├── lots.tsx           buy-transaction list
    │   ├── sales.tsx          sell-transaction list
    │   └── more.tsx           hub: Symbols (live) + later-plan stubs
    ├── lot/
    │   ├── new.tsx            add-lot form
    │   ├── [id].tsx           lot detail + evidence + delete
    │   └── [id]/edit.tsx      edit-lot form
    ├── sale/
    │   ├── new.tsx            add-sale form
    │   ├── [id].tsx           SIGNATURE screen: which lots this sale consumed
    │   └── [id]/edit.tsx      edit-sale form
    └── symbols/
        └── index.tsx          manage tickers: usage count, rename, delete-if-unused
```

`App.tsx` is deleted in Task 1 (Expo Router replaces it). `index.ts` is replaced by the `expo-router/entry` main field.

---

### Task 1: Dependencies, Expo Router entry, theme tokens, fonts

**Files:**
- Modify: `package.json` (deps, `main`, add `typecheck` script)
- Modify: `app.json` (scheme, plugins, dark UI)
- Delete: `App.tsx`
- Delete: `index.ts` (replaced by `expo-router/entry`)
- Create: `src/theme/tokens.ts`
- Create: `src/app/_layout.tsx`
- Create: `src/app/(tabs)/_layout.tsx`
- Create: `src/app/(tabs)/index.tsx`
- Create: `src/app/(tabs)/lots.tsx`
- Create: `src/app/(tabs)/sales.tsx`
- Create: `src/app/(tabs)/more.tsx`

**Interfaces:**
- Consumes: nothing (first task of this plan).
- Produces:
  - `src/theme/tokens.ts` exports `const color`, `const space`, `const radius`, `const font`, and `const fontFamily` (see Step 5 for exact shape) — every later component imports these.
  - A booting Expo Router app with a 4-tab bottom bar. Tab screens are minimal placeholders this task; later tasks fill `lots`, `sales`, `more`.
  - An `npm run typecheck` script (`tsc --noEmit`) used as the gate at the end of every task.

**Starting state.** The app still uses `App.tsx` + `index.ts` with `registerRootComponent`. `package.json` `main` is `index.ts`. `app.json` has `userInterfaceStyle: "light"` and `plugins: ["expo-sqlite"]`. No `src/app/`, `src/theme/`, `src/ui/`, `src/store/` directories exist.

- [ ] **Step 1: Install the router + font dependencies**

Run (working directory is the repo root):

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants
npx expo install expo-font @expo-google-fonts/space-grotesk @expo-google-fonts/ibm-plex-mono
npm install zustand
```

`expo install` picks versions compatible with the installed Expo SDK (57). If any package fails to resolve a compatible version, stop and report it (status `BLOCKED`) rather than forcing a version — the router version must match the SDK.

- [ ] **Step 2: Point the entry at Expo Router and add the typecheck script**

In `package.json`, change `"main": "index.ts"` to `"main": "expo-router/entry"`, and add a script:

```json
"typecheck": "tsc --noEmit"
```

Then delete the old entry files — Expo Router owns the entry now:

```bash
rm App.tsx index.ts
```

- [ ] **Step 3: Configure `app.json` for routing and the dark theme**

The design system is a dark "Quantum Neon" theme, so the app runs dark. Add a `scheme` (required by Expo Router for deep linking) and the `expo-router` plugin, and switch `userInterfaceStyle` to `"dark"`:

```jsonc
{
  "expo": {
    "name": "fifo-tracker-mobile",
    "slug": "fifo-tracker-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "fifotracker",
    "userInterfaceStyle": "dark",
    "icon": "./assets/icon.png",
    "ios": { "supportsTablet": true },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#0a0e1a",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false
    },
    "web": { "favicon": "./assets/favicon.png" },
    "plugins": ["expo-sqlite", "expo-router"]
  }
}
```

Keep the existing `assets/` icon references; only the keys shown above change.

- [ ] **Step 4: Write the theme tokens**

Create `src/theme/tokens.ts`. Values are ported verbatim from the design-system tokens (`.claude/skills/fifo-stock-tracker-design-system/project/tokens/{colors,spacing,typography}.css`). CSS `rem` (16px base) is converted to device-independent pixels. Colors that the CSS defines as `rgba(...)` over a dark navy are flattened to opaque hex where React Native shadows/borders need them, but translucent surfaces are kept as `rgba` strings (React Native accepts them).

```ts
// Ported from the fifo-stock-tracker-design-system "Quantum Neon" tokens.
// Dark glassmorphism: navy surfaces, cyan primary, magenta/lime/red accents.
export const color = {
  pageBg: '#0a0e1a',
  cardBg: 'rgba(255,255,255,0.05)',
  cardBorder: 'rgba(0,240,255,0.17)',
  borderStrong: 'rgba(0,240,255,0.40)',
  navbarBg: 'rgba(10,14,26,0.92)',
  stripe: 'rgba(0,240,255,0.035)',
  hover: 'rgba(0,240,255,0.07)',

  textBody: '#e8ecf4',
  textMuted: '#8a94a6',
  textOnAction: '#0a0e1a',

  actionPrimary: '#00f0ff',
  actionPrimaryActive: '#00c2d1',

  gain: '#39ff14',
  loss: '#ff3b30',
  danger: '#ff2e93',
  warning: '#ffc107',
  success: '#39ff14',

  inputBg: '#10182b',
} as const;

// Bootstrap spacer scale (rem) → px at a 16px base.
export const space = { 1: 4, 2: 8, 3: 16, 4: 24, 5: 48 } as const;

export const radius = { sm: 4, md: 6, lg: 8, pill: 999 } as const;

// Font family names are the exact exports of the @expo-google-fonts packages,
// loaded in src/app/_layout.tsx. Referencing a name that was not loaded makes
// React Native silently fall back to the system font, so these strings and the
// useFonts() map in the root layout must stay in sync.
export const fontFamily = {
  sansRegular: 'SpaceGrotesk_400Regular',
  sansMedium: 'SpaceGrotesk_500Medium',
  sansSemibold: 'SpaceGrotesk_600SemiBold',
  sansBold: 'SpaceGrotesk_700Bold',
  monoRegular: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemibold: 'IBMPlexMono_600SemiBold',
} as const;

export const font = {
  size: { xs: 12, sm: 14, md: 16, lg: 22, xl: 28, xxl: 40 },
  leadingTight: 1.2,
  leadingNormal: 1.5,
} as const;
```

- [ ] **Step 5: Write the root layout — fonts + a Stack**

Create `src/app/_layout.tsx`. This task loads fonts and renders the navigator; the database bootstrap is added in Task 2. While fonts load, render nothing (the native splash stays up).

```tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import { color } from '../theme/tokens';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  if (!fontsLoaded) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.navbarBg },
          headerTintColor: color.textBody,
          contentStyle: { backgroundColor: color.pageBg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
```

- [ ] **Step 6: Write the tab layout and four placeholder tab screens**

Create `src/app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';
import { color, fontFamily } from '../../theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: color.navbarBg },
        headerTitleStyle: { color: color.textBody, fontFamily: fontFamily.sansSemibold },
        headerTintColor: color.textBody,
        tabBarStyle: { backgroundColor: color.navbarBg, borderTopColor: color.cardBorder },
        tabBarActiveTintColor: color.actionPrimary,
        tabBarInactiveTintColor: color.textMuted,
        tabBarLabelStyle: { fontFamily: fontFamily.sansMedium },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'ภาพรวม' }} />
      <Tabs.Screen name="lots" options={{ title: 'ซื้อ' }} />
      <Tabs.Screen name="sales" options={{ title: 'ขาย' }} />
      <Tabs.Screen name="more" options={{ title: 'เพิ่มเติม' }} />
    </Tabs>
  );
}
```

Create the four placeholder screens. Each is a centered label this task (later tasks replace `lots`, `sales`, `more`; `index` stays a placeholder until plan 4). Example — `src/app/(tabs)/index.tsx`:

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { color, fontFamily, font, space } from '../../theme/tokens';

export default function DashboardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ภาพรวมพอร์ต</Text>
      <Text style={styles.muted}>มูลค่าพอร์ตและกำไรจะมาในเวอร์ชันถัดไป</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.pageBg, alignItems: 'center', justifyContent: 'center', padding: space[4] },
  title: { color: color.textBody, fontFamily: fontFamily.sansBold, fontSize: font.size.lg, marginBottom: space[2] },
  muted: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm, textAlign: 'center' },
});
```

Create `lots.tsx`, `sales.tsx`, `more.tsx` with the same shape, changing the component name and text (`'รายการซื้อ'`, `'รายการขาย'`, `'เพิ่มเติม'`). These are throwaway placeholders replaced in Tasks 5–9.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 8: Manual verification — the app boots into tabs**

Run: `npx expo start` and open on a device/emulator (or `w` for web as a quick smoke check of routing; native is authoritative).
Expected:
- App launches without a redbox.
- A dark screen with a 4-item bottom tab bar: ภาพรวม / ซื้อ / ขาย / เพิ่มเติม.
- Tapping each tab shows its centered placeholder text in the brand font (Space Grotesk — clearly not the system default).
- The status bar icons are light on the dark background.

If the fonts do not visibly change, the `useFonts` map keys and the `fontFamily` strings in `tokens.ts` have drifted — reconcile them before proceeding.

- [ ] **Step 9: Run the existing suite and commit**

Run: `npm test`
Expected: the plans 1–2 suite is still green (no screen is imported by any test).

```bash
git add -A
git commit -m "feat: migrate to Expo Router shell with dark theme and brand fonts"
```

---

### Task 2: Database bootstrap on launch + the reload store

**Files:**
- Create: `src/services/appDatabase.ts`
- Create: `src/store/useAppStore.ts`
- Test: `src/store/__tests__/useAppStore.test.ts`
- Modify: `src/app/_layout.tsx` (bootstrap the DB into the store behind a gate)

**Interfaces:**
- Consumes: `openDatabase` from `src/db/connection.ts`, `runMigrations` from `src/db/schema.ts`, `SqlDatabase` from `src/db/sqlDatabase.ts`.
- Produces:
  - `src/services/appDatabase.ts` → `export function initializeDatabase(): SqlDatabase` — opens `fifo.db` and runs migrations; returns the handle. Native (expo-sqlite), no automated test.
  - `src/store/useAppStore.ts` → a zustand store with state `{ db: SqlDatabase | null; dataVersion: number }` and actions `setDb(db: SqlDatabase): void` and `reload(): void`. `reload()` increments `dataVersion`. Later tasks read `db` with `useAppStore(s => s.db)` and call `useAppStore.getState().reload()` after every mutation; lists re-query when `dataVersion` changes.

- [ ] **Step 1: Write the failing store test**

Create `src/store/__tests__/useAppStore.test.ts`:

```ts
import { useAppStore } from '../useAppStore';
import type { SqlDatabase } from '../../db/sqlDatabase';

const fakeDb = {} as SqlDatabase;

beforeEach(() => {
  useAppStore.setState({ db: null, dataVersion: 0 });
});

test('setDb stores the handle', () => {
  useAppStore.getState().setDb(fakeDb);
  expect(useAppStore.getState().db).toBe(fakeDb);
});

test('reload increments dataVersion', () => {
  expect(useAppStore.getState().dataVersion).toBe(0);
  useAppStore.getState().reload();
  useAppStore.getState().reload();
  expect(useAppStore.getState().dataVersion).toBe(2);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- useAppStore`
Expected: FAIL — cannot find module `../useAppStore`.

- [ ] **Step 3: Write the store**

Create `src/store/useAppStore.ts`:

```ts
import { create } from 'zustand';
import type { SqlDatabase } from '../db/sqlDatabase';

interface AppState {
  db: SqlDatabase | null;
  /** Bumped on every mutation so subscribed lists re-query. */
  dataVersion: number;
  setDb: (db: SqlDatabase) => void;
  reload: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  db: null,
  dataVersion: 0,
  setDb: (db) => set({ db }),
  reload: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),
}));
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- useAppStore`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the database bootstrap**

Create `src/services/appDatabase.ts`:

```ts
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
```

- [ ] **Step 6: Bootstrap the DB into the store behind a gate in the root layout**

Modify `src/app/_layout.tsx` so that after fonts load it opens the DB once, stores it, and renders the navigator only when both fonts and DB are ready. Replace the component body:

```tsx
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_400Regular, SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import { color, fontFamily, font, space } from '../theme/tokens';
import { initializeDatabase } from '../services/appDatabase';
import { useAppStore } from '../store/useAppStore';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular, SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold,
    IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold,
  });
  const db = useAppStore((s) => s.db);
  const setDb = useAppStore((s) => s.setDb);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    if (db) return;
    try {
      setDb(initializeDatabase());
    } catch (e) {
      setDbError(e instanceof Error ? e.message : String(e));
    }
  }, [db, setDb]);

  if (dbError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errTitle}>เปิดฐานข้อมูลไม่สำเร็จ</Text>
        <Text style={styles.errBody}>{dbError}</Text>
      </View>
    );
  }

  if (!fontsLoaded || !db) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.navbarBg },
          headerTintColor: color.textBody,
          headerTitleStyle: { fontFamily: fontFamily.sansSemibold },
          contentStyle: { backgroundColor: color.pageBg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: color.pageBg, alignItems: 'center', justifyContent: 'center', padding: space[4] },
  errTitle: { color: color.loss, fontFamily: fontFamily.sansBold, fontSize: font.size.lg, marginBottom: space[2] },
  errBody: { color: color.textMuted, fontFamily: fontFamily.monoRegular, fontSize: font.size.sm, textAlign: 'center' },
});
```

(The later detail/form/symbols routes get registered in the Stack as they are created; Expo Router also auto-registers any file under `src/app/`, so an explicit `<Stack.Screen>` entry is only needed to customize options. Tasks 5–8 add those entries.)

- [ ] **Step 7: Typecheck, test, manual-verify, commit**

Run: `npm run typecheck` → passes.
Run: `npm test` → green, including the new `useAppStore` test.
Manual verification (`npx expo start`, native):
- App still boots into the tabs (fonts + DB both resolved).
- To prove the DB really opened and migrated, temporarily add to `src/app/(tabs)/index.tsx` a line that reads `useAppStore(s => s.db)` and calls `listSymbols(db)` (from `src/db/repo`) inside a `useEffect`, logging the count — expect `0` with no error on a fresh install. Remove the temporary line before committing.
- Confirm no redbox on a cold start and on a reload.

```bash
git add -A
git commit -m "feat: open and migrate the on-device database at launch, expose it via a reload store"
```

---

### Task 3: Shared UI components

**Files:**
- Create: `src/ui/components/Button.tsx`
- Create: `src/ui/components/Card.tsx`
- Create: `src/ui/components/Field.tsx`
- Create: `src/ui/components/GainLoss.tsx`
- Create: `src/ui/components/Screen.tsx`
- Create: `src/ui/components/ListRow.tsx`
- Create: `src/ui/components/EmptyState.tsx`

**Interfaces:**
- Consumes: `src/theme/tokens.ts`.
- Produces the presentational building blocks every screen composes, so later screen tasks carry almost no `StyleSheet` of their own:
  - `Button({ title, onPress, variant?: 'primary' | 'outline' | 'danger', disabled?, style? })`
  - `Card({ children, style? })`, `CardTitle({ children })`
  - `FormField({ label, error?, helpText?, children })`, `TextInput(props: RN TextInputProps & { error?: boolean })`, `DecimalInput(props)` — a `TextInput` preset with `keyboardType="decimal-pad"` and `,` stripped on change
  - `GainLoss({ value: string, display: string })` — `value` is a decimal **string** used only to pick the color (green when ≥ 0, red otherwise, compared via `decimal.js`, never `Number`); `display` is the already-formatted label to show (produced by `formatSignedThb` once Task 4 lands)
  - `Screen({ children, scroll? })` — safe-area page container on `color.pageBg`
  - `ListRow({ onPress?, children })` — a tappable padded row with a bottom divider
  - `EmptyState({ title, hint? })`

**Note on the design system.** React Native cannot reproduce the CSS blur "glow" shadows literally. Approximate the Quantum Neon look with the token borders (`color.cardBorder` / `color.borderStrong`), the translucent `color.cardBg`, and Android `elevation` — do not attempt colored blur shadows. This is a deliberate fidelity trade-off, not an omission.

- [ ] **Step 1: Button**

Create `src/ui/components/Button.tsx`:

```tsx
import { Pressable, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, space, font, fontFamily } from '../../theme/tokens';

type Variant = 'primary' | 'outline' | 'danger';

export function Button({
  title, onPress, variant = 'primary', disabled = false, style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const v = styles[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base, v.box,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text style={[styles.label, v.label]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fontFamily.sansSemibold, fontSize: font.size.md },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  primary: {
    box: { backgroundColor: color.actionPrimary, borderColor: color.actionPrimary },
    label: { color: color.textOnAction },
  } as any,
  outline: {
    box: { backgroundColor: 'transparent', borderColor: color.borderStrong },
    label: { color: color.actionPrimary },
  } as any,
  danger: {
    box: { backgroundColor: 'transparent', borderColor: color.danger },
    label: { color: color.danger },
  } as any,
});
```

(The `as any` on the variant sub-objects keeps `StyleSheet.create` from flattening the nested shape; they are read as `styles[variant].box` / `.label`.)

- [ ] **Step 2: Card**

Create `src/ui/components/Card.tsx`:

```tsx
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, space, font, fontFamily } from '../../theme/tokens';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.cardBg, borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.lg, padding: space[4] },
  title: { color: color.textBody, fontFamily: fontFamily.sansSemibold, fontSize: font.size.lg, marginBottom: space[3] },
});
```

- [ ] **Step 3: Field (FormField + TextInput + DecimalInput)**

Create `src/ui/components/Field.tsx`:

```tsx
import { View, Text, TextInput as RNTextInput, StyleSheet, type TextInputProps } from 'react-native';
import { color, radius, space, font, fontFamily } from '../../theme/tokens';

export function FormField({
  label, error, helpText, children,
}: {
  label: string;
  error?: string;
  helpText?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {helpText ? <Text style={styles.help}>{helpText}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function TextInput({ error, style, ...rest }: TextInputProps & { error?: boolean }) {
  return (
    <RNTextInput
      placeholderTextColor={color.textMuted}
      style={[styles.input, error ? styles.inputError : null, style]}
      {...rest}
    />
  );
}

/** Decimal entry: numeric keypad, and `,` stripped so grouping chars never reach parseInput. */
export function DecimalInput({ value, onChangeText, error, style, ...rest }: TextInputProps & { error?: boolean }) {
  return (
    <TextInput
      keyboardType="decimal-pad"
      inputMode="decimal"
      value={value}
      onChangeText={(t) => onChangeText?.(t.replace(/,/g, ''))}
      error={error}
      style={style}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: space[3] },
  label: { color: color.textBody, fontFamily: fontFamily.sansMedium, fontSize: font.size.sm, marginBottom: space[1] },
  input: {
    backgroundColor: color.inputBg, borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.md,
    paddingVertical: space[2], paddingHorizontal: space[3], color: color.textBody,
    fontFamily: fontFamily.monoRegular, fontSize: font.size.md,
  },
  inputError: { borderColor: color.loss },
  help: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: space[1] },
  error: { color: color.loss, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: space[1] },
});
```

- [ ] **Step 4: GainLoss**

Create `src/ui/components/GainLoss.tsx`. The comparison uses `decimal.js`, never `Number` (CLAUDE.md) — display formatting is delegated to `formatSignedThb` once Task 4 exists, but to keep this component self-contained now it takes a pre-formatted string and only colors it:

```tsx
import { Text, StyleSheet } from 'react-native';
import Decimal from 'decimal.js';
import { color, font, fontFamily } from '../../theme/tokens';

/** `value` is a decimal string (e.g. "982.0260"); `display` is the already-formatted label. */
export function GainLoss({ value, display }: { value: string; display: string }) {
  const isGain = new Decimal(value).greaterThanOrEqualTo(0);
  return <Text style={[styles.base, { color: isGain ? color.gain : color.loss }]}>{display}</Text>;
}

const styles = StyleSheet.create({
  base: { fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
});
```

- [ ] **Step 5: Screen container**

Create `src/ui/components/Screen.tsx`:

```tsx
import { ScrollView, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, space } from '../../theme/tokens';

export function Screen({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  const inner = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">{children}</ScrollView> : inner}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.pageBg },
  body: { flex: 1, padding: space[3] },
  scroll: { padding: space[3] },
});
```

- [ ] **Step 6: ListRow and EmptyState**

Create `src/ui/components/ListRow.tsx`:

```tsx
import { Pressable, View, StyleSheet } from 'react-native';
import { color, space } from '../../theme/tokens';

export function ListRow({ onPress, children }: { onPress?: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}>
      <View style={styles.inner}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomColor: color.cardBorder, borderBottomWidth: 1 },
  inner: { paddingVertical: space[3], paddingHorizontal: space[2], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pressed: { backgroundColor: color.hover },
});
```

Create `src/ui/components/EmptyState.tsx`:

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { color, space, font, fontFamily } from '../../theme/tokens';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: space[5] },
  title: { color: color.textBody, fontFamily: fontFamily.sansMedium, fontSize: font.size.md, marginBottom: space[1] },
  hint: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm, textAlign: 'center' },
});
```

- [ ] **Step 7: Typecheck, test, manual-verify, commit**

Run: `npm run typecheck` → passes.
Run: `npm test` → still green (components are not imported by any test).
Manual verification: temporarily render a `Button`, `Card`, `FormField`+`TextInput`, and `EmptyState` inside `src/app/(tabs)/index.tsx`; `npx expo start`; confirm the primary button is cyan on dark, the card has a faint cyan border on a translucent fill, the input accepts text in the mono font, and everything sits on the dark page background. Remove the temporary render before committing.

```bash
git add -A
git commit -m "feat: add shared Quantum-Neon UI components (Button, Card, Field, GainLoss, Screen, ListRow, EmptyState)"
```

---

### Task 4: Display formatting

**Files:**
- Create: `src/ui/format.ts`
- Test: `src/ui/__tests__/format.test.ts`

**Interfaces:**
- Consumes: `decimal.js`, `DP` from `src/core/money.ts`.
- Produces (all take a `Decimal` **or** a decimal string, return a display `string`; never accept or return a `number` for a monetary value):
  - `formatMoneyThb(value): string` → grouped to 2 dp, suffixed `" ฿"` (e.g. `"51,565.64 ฿"`).
  - `formatUsd(value): string` → grouped to 2 dp, prefixed `"$"` (e.g. `"$1,423.50"`).
  - `formatPrice(value): string` → USD price trimmed to a sensible precision: 2 dp minimum, up to 6 dp, trailing zeros beyond 2 dp trimmed (e.g. `"142.35"`, `"142.355000" → "142.355"`), prefixed `"$"`.
  - `formatQty(value): string` → trailing zeros trimmed, at least 0 dp shown, up to 8 (e.g. `"10.00000000" → "10"`, `"1.50000000" → "1.5"`).
  - `formatSignedThb(value): string` → like `formatMoneyThb` but with an explicit leading `"+"` when the value is ≥ 0 (e.g. `"+982.03 ฿"`, `"-120.00 ฿"`).
  - `formatFxRate(value): string` → 4 dp (e.g. `"36.2100"`).

- [ ] **Step 1: Write the failing tests**

Create `src/ui/__tests__/format.test.ts`:

```ts
import Decimal from 'decimal.js';
import {
  formatMoneyThb, formatUsd, formatPrice, formatQty, formatSignedThb, formatFxRate,
} from '../format';

test('formatMoneyThb groups thousands and fixes 2 dp with baht suffix', () => {
  expect(formatMoneyThb('51565.6350')).toBe('51,565.64'.concat(' ฿')); // HALF_EVEN: .635 → .64
  expect(formatMoneyThb('0')).toBe('0.00 ฿');
  expect(formatMoneyThb(new Decimal('1234567.005'))).toBe('1,234,567.00 ฿'); // HALF_EVEN: .005 → .00
});

test('formatUsd fixes 2 dp with a dollar prefix', () => {
  expect(formatUsd('1423.5')).toBe('$1,423.50');
  expect(formatUsd('0')).toBe('$0.00');
});

test('formatPrice keeps 2 dp minimum and trims trailing zeros up to 6 dp', () => {
  expect(formatPrice('142.350000')).toBe('$142.35');
  expect(formatPrice('142.355000')).toBe('$142.355');
  expect(formatPrice('142')).toBe('$142.00');
});

test('formatQty trims trailing zeros, dropping the point when whole', () => {
  expect(formatQty('10.00000000')).toBe('10');
  expect(formatQty('1.50000000')).toBe('1.5');
  expect(formatQty('0.12345678')).toBe('0.12345678');
});

test('formatSignedThb prefixes + for non-negative, - for negative', () => {
  expect(formatSignedThb('982.0260')).toBe('+982.03 ฿');
  expect(formatSignedThb('-120')).toBe('-120.00 ฿');
  expect(formatSignedThb('0')).toBe('+0.00 ฿');
});

test('formatFxRate fixes 4 dp', () => {
  expect(formatFxRate('36.21')).toBe('36.2100');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- format`
Expected: FAIL — cannot find module `../format`.

- [ ] **Step 3: Implement the formatters**

Create `src/ui/format.ts`:

```ts
import Decimal from 'decimal.js';

type Num = Decimal | string;

function d(value: Num): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Groups the integer part with commas; `frac` is an already-fixed fractional string (no point). */
function group(intPart: string): string {
  const neg = intPart.startsWith('-');
  const digits = neg ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg ? `-${grouped}` : grouped;
}

function fixed(value: Num, dp: number): string {
  const s = d(value).toFixed(dp, Decimal.ROUND_HALF_EVEN); // e.g. "-51565.64" or "142"
  const [intPart, frac] = s.split('.');
  const groupedInt = group(intPart ?? '0');
  return frac === undefined ? groupedInt : `${groupedInt}.${frac}`;
}

export function formatMoneyThb(value: Num): string {
  return `${fixed(value, 2)} ฿`;
}

export function formatUsd(value: Num): string {
  return `$${fixed(value, 2)}`;
}

export function formatFxRate(value: Num): string {
  return fixed(value, 4);
}

export function formatPrice(value: Num): string {
  // 2 dp minimum, up to 6, trailing zeros beyond 2 dp trimmed.
  const full = d(value).toFixed(6, Decimal.ROUND_HALF_EVEN); // "142.355000"
  const [intPart, frac = ''] = full.split('.');
  let trimmed = frac.replace(/0+$/, '');
  if (trimmed.length < 2) trimmed = frac.slice(0, 2); // keep at least 2 dp
  return `$${group(intPart ?? '0')}.${trimmed}`;
}

export function formatQty(value: Num): string {
  const full = d(value).toFixed(8, Decimal.ROUND_HALF_EVEN); // "10.00000000"
  const [intPart, frac = ''] = full.split('.');
  const trimmed = frac.replace(/0+$/, '');
  return trimmed === '' ? group(intPart ?? '0') : `${group(intPart ?? '0')}.${trimmed}`;
}

export function formatSignedThb(value: Num): string {
  const n = d(value);
  const sign = n.greaterThanOrEqualTo(0) ? '+' : '';
  return `${sign}${fixed(n, 2)} ฿`;
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm test -- format`
Expected: PASS (all cases, including the two HALF_EVEN rounding cases `.635 → .64` and `.005 → .00`).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` → passes.

```bash
git add -A
git commit -m "feat: add Decimal-safe display formatters for money, price, quantity, and gain"
```

---

### Task 5: Symbol combo logic, usage counts, and the Symbols screen

**Files:**
- Create: `src/ui/symbolCombo.ts`
- Test: `src/ui/__tests__/symbolCombo.test.ts`
- Create: `src/services/symbols.ts`
- Test: `src/services/__tests__/symbols.test.ts`
- Create: `src/ui/components/SymbolCombo.tsx`
- Create: `src/app/symbols/index.tsx`
- Modify: `src/app/(tabs)/more.tsx` (link to the Symbols screen)

**Interfaces:**
- Consumes: `SymbolRow` from `src/core/types.ts`; `listSymbols`, `createSymbol`, `renameSymbol`, `deleteSymbol`, `SymbolInUseError`, `DuplicateTickerError` from `src/db/repo.ts`; the app store; the shared components.
- Produces:
  - `src/ui/symbolCombo.ts` → `interface ComboResult { matches: SymbolRow[]; exactMatch: SymbolRow | null; canAdd: boolean; addTicker: string }` and `function filterSymbols(query: string, symbols: readonly SymbolRow[]): ComboResult`.
  - `src/services/symbols.ts` → `interface SymbolWithCounts { symbol: SymbolRow; lotCount: number; saleCount: number }` and `function listSymbolsWithCounts(db: SqlDatabase): SymbolWithCounts[]`.
  - `src/ui/components/SymbolCombo.tsx` → `SymbolCombo({ symbols, query, symbolId, onPick, onChangeQuery, onAdd, error })` — the searchable ticker field reused by both the lot and sale forms. `onAdd(ticker: string)` is supplied by the screen (it does the DB insert) and returns the new `SymbolRow`.

- [ ] **Step 1: Write the failing combo tests**

Create `src/ui/__tests__/symbolCombo.test.ts`:

```ts
import { filterSymbols } from '../symbolCombo';
import type { SymbolRow } from '../../core/types';

const symbols: SymbolRow[] = [
  { id: 1, ticker: 'NVDA', name: 'NVIDIA' },
  { id: 2, ticker: 'AAPL', name: 'Apple' },
  { id: 3, ticker: 'NFLX', name: 'Netflix' },
];

test('empty query matches everything and offers no add', () => {
  const r = filterSymbols('', symbols);
  expect(r.matches).toHaveLength(3);
  expect(r.canAdd).toBe(false);
  expect(r.exactMatch).toBeNull();
});

test('prefix matches are case- and whitespace-insensitive', () => {
  const r = filterSymbols(' nf ', symbols);
  expect(r.matches.map((s) => s.ticker)).toEqual(['NFLX']);
  expect(r.addTicker).toBe('NF');
});

test('matches on name too', () => {
  const r = filterSymbols('apple', symbols);
  expect(r.matches.map((s) => s.ticker)).toEqual(['AAPL']);
});

test('exact ticker match is reported and suppresses add', () => {
  const r = filterSymbols('nvda', symbols);
  expect(r.exactMatch?.id).toBe(1);
  expect(r.canAdd).toBe(false);
});

test('a non-matching non-empty query offers to add the normalized ticker', () => {
  const r = filterSymbols('tsla', symbols);
  expect(r.matches).toHaveLength(0);
  expect(r.canAdd).toBe(true);
  expect(r.addTicker).toBe('TSLA');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- symbolCombo`
Expected: FAIL — cannot find module `../symbolCombo`.

- [ ] **Step 3: Implement the combo filter**

Create `src/ui/symbolCombo.ts`:

```ts
import type { SymbolRow } from '../core/types';

export interface ComboResult {
  matches: SymbolRow[];
  exactMatch: SymbolRow | null;
  canAdd: boolean;
  addTicker: string;
}

export function filterSymbols(query: string, symbols: readonly SymbolRow[]): ComboResult {
  const normalized = query.trim().toUpperCase();
  if (normalized === '') {
    return { matches: [...symbols], exactMatch: null, canAdd: false, addTicker: '' };
  }
  const matches = symbols.filter(
    (s) => s.ticker.includes(normalized) || s.name.toUpperCase().includes(normalized),
  );
  const exactMatch = symbols.find((s) => s.ticker === normalized) ?? null;
  return { matches, exactMatch, canAdd: exactMatch === null, addTicker: normalized };
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm test -- symbolCombo`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing usage-count test**

Create `src/services/__tests__/symbols.test.ts`:

```ts
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { createSymbol } from '../../db/repo';
import { addLot, addSale } from '../ledger';
import { listSymbolsWithCounts } from '../symbols';
import Decimal from 'decimal.js';
import type { SqlDatabase } from '../../db/sqlDatabase';

function freshDb(): SqlDatabase {
  const db = openTestDatabase();
  runMigrations(db);
  return db;
}

test('counts lots and sales per symbol, ticker-ordered, zero for unused', () => {
  const db = freshDb();
  const nvda = createSymbol(db, 'NVDA');
  const aapl = createSymbol(db, 'AAPL');
  createSymbol(db, 'ZZZZ'); // unused

  addLot(db, { symbolId: nvda.id, buyDate: '2026-01-01', priceUsd: new Decimal('100'), qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
  addLot(db, { symbolId: nvda.id, buyDate: '2026-01-02', priceUsd: new Decimal('110'), qty: new Decimal('5'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
  addSale(db, { symbolId: nvda.id, sellDate: '2026-02-01', qtySold: new Decimal('3'), salePriceUsd: new Decimal('120'), feeUsd: new Decimal('0'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });
  addLot(db, { symbolId: aapl.id, buyDate: '2026-01-01', priceUsd: new Decimal('50'), qty: new Decimal('4'), fxRateUsdThb: new Decimal('36'), evidenceFile: null });

  const result = listSymbolsWithCounts(db);
  expect(result.map((r) => r.symbol.ticker)).toEqual(['AAPL', 'NVDA', 'ZZZZ']);
  const byTicker = Object.fromEntries(result.map((r) => [r.symbol.ticker, r]));
  expect(byTicker.NVDA).toMatchObject({ lotCount: 2, saleCount: 1 });
  expect(byTicker.AAPL).toMatchObject({ lotCount: 1, saleCount: 0 });
  expect(byTicker.ZZZZ).toMatchObject({ lotCount: 0, saleCount: 0 });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npm test -- services/__tests__/symbols`
Expected: FAIL — cannot find module `../symbols`.

- [ ] **Step 7: Implement usage counts**

Create `src/services/symbols.ts`. `COUNT(*)` is a row count, not a money/quantity `SUM`, so it is allowed (the CLAUDE.md rule bans aggregating `TEXT` money columns, not counting rows):

```ts
import type { SymbolRow } from '../core/types';
import type { SqlDatabase } from '../db/sqlDatabase';
import { listSymbols } from '../db/repo';

export interface SymbolWithCounts {
  symbol: SymbolRow;
  lotCount: number;
  saleCount: number;
}

export function listSymbolsWithCounts(db: SqlDatabase): SymbolWithCounts[] {
  const symbols = listSymbols(db); // already ORDER BY ticker
  const lotCounts = countBySymbol(db, 'lots');
  const saleCounts = countBySymbol(db, 'sales');
  return symbols.map((symbol) => ({
    symbol,
    lotCount: lotCounts.get(symbol.id) ?? 0,
    saleCount: saleCounts.get(symbol.id) ?? 0,
  }));
}

function countBySymbol(db: SqlDatabase, table: 'lots' | 'sales'): Map<number, number> {
  const rows = db.getAllSync<{ symbolId: number; count: number }>(
    `SELECT symbol_id AS symbolId, COUNT(*) AS count FROM ${table} GROUP BY symbol_id;`,
  );
  return new Map(rows.map((r) => [r.symbolId, r.count]));
}
```

- [ ] **Step 8: Run to verify passing**

Run: `npm test -- services/__tests__/symbols`
Expected: PASS.

- [ ] **Step 9: Build the SymbolCombo component**

Create `src/ui/components/SymbolCombo.tsx`. A text field plus a dropdown list of matches and, when the typed ticker is new, an "เพิ่ม <TICKER>" row. Selecting a match calls `onPick`; tapping add calls `onAdd` (which does the DB insert in the screen) and then treats the result as picked.

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { SymbolRow } from '../../core/types';
import { filterSymbols } from '../symbolCombo';
import { FormField, TextInput } from './Field';
import { color, space, radius, font, fontFamily } from '../../theme/tokens';

export function SymbolCombo({
  symbols, query, symbolId, onPick, onChangeQuery, onAdd, error,
}: {
  symbols: readonly SymbolRow[];
  query: string;
  symbolId: number | null;
  onPick: (symbol: SymbolRow) => void;
  onChangeQuery: (text: string) => void;
  onAdd: (ticker: string) => void;
  error?: string;
}) {
  const { matches, canAdd, addTicker } = filterSymbols(query, symbols);
  const showList = query.trim() !== '' && symbolId === null;

  return (
    <FormField label="สัญลักษณ์" error={error}>
      <TextInput
        value={query}
        onChangeText={onChangeQuery}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="เช่น NVDA"
        error={!!error}
      />
      {showList ? (
        <View style={styles.dropdown}>
          {matches.map((s) => (
            <Pressable key={s.id} onPress={() => onPick(s)} style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
              <Text style={styles.ticker}>{s.ticker}</Text>
              {s.name ? <Text style={styles.name}>{s.name}</Text> : null}
            </Pressable>
          ))}
          {canAdd ? (
            <Pressable onPress={() => onAdd(addTicker)} style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
              <Text style={styles.add}>เพิ่ม “{addTicker}”</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </FormField>
  );
}

const styles = StyleSheet.create({
  dropdown: { marginTop: space[1], borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.md, backgroundColor: color.inputBg, overflow: 'hidden' },
  row: { paddingVertical: space[2], paddingHorizontal: space[3], borderBottomColor: color.cardBorder, borderBottomWidth: StyleSheet.hairlineWidth },
  pressed: { backgroundColor: color.hover },
  ticker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
  name: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs },
  add: { color: color.actionPrimary, fontFamily: fontFamily.sansSemibold, fontSize: font.size.md },
});
```

- [ ] **Step 10: Build the Symbols management screen**

Create `src/app/symbols/index.tsx`. Lists every symbol with its usage counts; allows renaming the display name and deleting symbols that no lot or sale references. Deletion of a referenced symbol is refused — the button is disabled when counts > 0, and `SymbolInUseError` is caught as a belt-and-braces guard.

```tsx
import { useMemo, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { ListRow } from '../../ui/components/ListRow';
import { EmptyState } from '../../ui/components/EmptyState';
import { Button } from '../../ui/components/Button';
import { FormField, TextInput } from '../../ui/components/Field';
import { useAppStore } from '../../store/useAppStore';
import { listSymbolsWithCounts } from '../../services/symbols';
import { renameSymbol, deleteSymbol, SymbolInUseError } from '../../db/repo';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function SymbolsScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const rows = useMemo(() => listSymbolsWithCounts(db), [db, dataVersion]);
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);

  function saveName() {
    if (!editing) return;
    renameSymbol(db, editing.id, editing.name.trim());
    setEditing(null);
    reload();
  }

  function remove(id: number, ticker: string, inUse: boolean) {
    if (inUse) return;
    Alert.alert('ลบสัญลักษณ์', `ลบ ${ticker}?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ', style: 'destructive',
        onPress: () => {
          try {
            deleteSymbol(db, id);
            reload();
          } catch (e) {
            if (e instanceof SymbolInUseError) Alert.alert('ลบไม่ได้', 'สัญลักษณ์นี้ถูกใช้งานอยู่');
            else throw e;
          }
        },
      },
    ]);
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'จัดการสัญลักษณ์', headerShown: true }} />
      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีสัญลักษณ์" hint="เพิ่มได้จากฟอร์มบันทึกการซื้อ" />
      ) : (
        rows.map(({ symbol, lotCount, saleCount }) => {
          const inUse = lotCount > 0 || saleCount > 0;
          return (
            <ListRow key={symbol.id}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ticker}>{symbol.ticker}</Text>
                <Text style={styles.meta}>
                  {symbol.name ? `${symbol.name} · ` : ''}{lotCount} ซื้อ · {saleCount} ขาย
                </Text>
              </View>
              <View style={styles.actions}>
                <Button title="แก้ชื่อ" variant="outline" onPress={() => setEditing({ id: symbol.id, name: symbol.name })} />
                <Button title="ลบ" variant="danger" disabled={inUse} onPress={() => remove(symbol.id, symbol.ticker, inUse)} />
              </View>
            </ListRow>
          );
        })
      )}

      {editing ? (
        <View style={styles.editor}>
          <FormField label="ชื่อที่แสดง">
            <TextInput value={editing.name} onChangeText={(name) => setEditing({ ...editing, name })} autoFocus />
          </FormField>
          <View style={styles.actions}>
            <Button title="บันทึก" onPress={saveName} />
            <Button title="ยกเลิก" variant="outline" onPress={() => setEditing(null)} />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ticker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
  meta: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space[2] },
  editor: { marginTop: space[4], borderTopColor: color.cardBorder, borderTopWidth: 1, paddingTop: space[3] },
});
```

- [ ] **Step 11: Link the Symbols screen from the More tab**

Replace `src/app/(tabs)/more.tsx` with a hub that routes to Symbols now and shows later-plan destinations as disabled rows:

```tsx
import { Link } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/components/Screen';
import { ListRow } from '../../ui/components/ListRow';
import { color, font, fontFamily } from '../../theme/tokens';

export default function MoreScreen() {
  return (
    <Screen scroll>
      <Link href="/symbols" asChild>
        <ListRow onPress={() => {}}>
          <Text style={styles.item}>จัดการสัญลักษณ์</Text>
          <Text style={styles.chev}>›</Text>
        </ListRow>
      </Link>
      <View style={styles.disabledRow}><Text style={styles.disabled}>สำรอง/กู้คืนข้อมูล (เร็วๆ นี้)</Text></View>
      <View style={styles.disabledRow}><Text style={styles.disabled}>รายงาน PDF (เร็วๆ นี้)</Text></View>
      <View style={styles.disabledRow}><Text style={styles.disabled}>ตั้งค่าและล็อก (เร็วๆ นี้)</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { color: color.textBody, fontFamily: fontFamily.sansMedium, fontSize: font.size.md },
  chev: { color: color.textMuted, fontSize: font.size.lg },
  disabledRow: { paddingVertical: 16, paddingHorizontal: 8, borderBottomColor: color.cardBorder, borderBottomWidth: 1 },
  disabled: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.md },
});
```

- [ ] **Step 12: Typecheck, test, manual-verify, commit**

Run: `npm run typecheck` → passes.
Run: `npm test` → green (combo + symbols service tests added).
Manual verification (`npx expo start`): go to เพิ่มเติม → จัดการสัญลักษณ์. On a fresh DB it shows the empty state. (You cannot add a symbol from here yet — creation is on the buy form, Task 6. Re-verify delete/rename after Task 6 populates symbols, or temporarily insert one via the buy form once it exists.)

```bash
git add -A
git commit -m "feat: add symbol combo filter, usage counts, and the Symbols management screen"
```

---

### Task 6: Lot form, lots list, and lot detail

**Files:**
- Create: `src/ui/dateInput.ts`
- Test: `src/ui/__tests__/dateInput.test.ts`
- Create: `src/ui/lotForm.ts`
- Test: `src/ui/__tests__/lotForm.test.ts`
- Create: `src/ui/components/DateField.tsx`
- Create: `src/app/lot/new.tsx`
- Create: `src/app/lot/[id].tsx`
- Create: `src/app/lot/[id]/edit.tsx`
- Modify: `src/app/(tabs)/lots.tsx` (the real list)
- Modify: `src/app/_layout.tsx` (register the `lot/*` stack screens' titles)

**Interfaces:**
- Consumes: `parseInput`, `InvalidNumberError`, `DP` from `src/core/money.ts`; `NewLotInput`, `addLot`, `editLot`, `deleteLot`, `toDomainLot` from `src/services/ledger.ts`; `listLots`, `getLot`, `listSymbols`, `listAllocations`, `createSymbol`, `findSymbolByTicker`, `DuplicateTickerError` from `src/db/repo.ts`; `lotQtyRemaining`, `lotCostThb` from `src/core/derive.ts`; the formatters, components, and store.
- Produces:
  - `src/ui/dateInput.ts` → `function isValidYmd(value: string): boolean` and `function todayYmd(): string`.
  - `src/ui/lotForm.ts` → `interface LotFormState`, `type LotFormErrors`, `interface LotFormResult`, `function validateLotForm(state: LotFormState): LotFormResult` (see Step 3).
  - `src/ui/components/DateField.tsx` → `DateField({ label, value, onChange, error })` wrapping the native date picker; `value`/`onChange` use `'YYYY-MM-DD'` strings.

- [ ] **Step 1: Write the failing date-util tests**

Create `src/ui/__tests__/dateInput.test.ts`:

```ts
import { isValidYmd, todayYmd } from '../dateInput';

test('accepts a real calendar date', () => {
  expect(isValidYmd('2026-03-14')).toBe(true);
});

test('rejects malformed or impossible dates', () => {
  expect(isValidYmd('2026-3-14')).toBe(false);   // not zero-padded
  expect(isValidYmd('2026-02-31')).toBe(false);   // no Feb 31
  expect(isValidYmd('2026-13-01')).toBe(false);   // month 13
  expect(isValidYmd('')).toBe(false);
  expect(isValidYmd('14/03/2026')).toBe(false);
});

test('todayYmd returns a value that passes isValidYmd', () => {
  expect(isValidYmd(todayYmd())).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- dateInput`
Expected: FAIL — cannot find module `../dateInput`.

- [ ] **Step 3: Implement the date utilities**

Create `src/ui/dateInput.ts`:

```ts
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(value: string): boolean {
  if (!YMD.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m! - 1 &&
    date.getUTCDate() === d
  );
}

export function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm test -- dateInput`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing lot-form tests**

Create `src/ui/__tests__/lotForm.test.ts`:

```ts
import Decimal from 'decimal.js';
import { validateLotForm, type LotFormState } from '../lotForm';

const base: LotFormState = {
  symbolId: 1, buyDate: '2026-03-14', priceUsd: '142.35', qty: '10', fxRateUsdThb: '36.21', evidenceFile: null,
};

test('a complete valid form yields a NewLotInput with Decimal fields', () => {
  const { input, errors } = validateLotForm(base);
  expect(errors).toEqual({});
  expect(input).not.toBeNull();
  expect(input!.symbolId).toBe(1);
  expect(input!.priceUsd).toBeInstanceOf(Decimal);
  expect(input!.priceUsd.toString()).toBe('142.35');
  expect(input!.qty.toString()).toBe('10');
  expect(input!.evidenceFile).toBeNull();
});

test('missing symbol is an error', () => {
  const { input, errors } = validateLotForm({ ...base, symbolId: null });
  expect(input).toBeNull();
  expect(errors.symbol).toBeDefined();
});

test('bad date is an error', () => {
  const { errors } = validateLotForm({ ...base, buyDate: '2026-02-31' });
  expect(errors.buyDate).toBeDefined();
});

test('a comma-grouped or exponential number is rejected', () => {
  expect(validateLotForm({ ...base, qty: '1,000' }).errors.qty).toBeDefined();
  expect(validateLotForm({ ...base, priceUsd: '1e3' }).errors.priceUsd).toBeDefined();
});

test('more decimal places than the field allows is rejected', () => {
  // price is 6 dp
  expect(validateLotForm({ ...base, priceUsd: '1.1234567' }).errors.priceUsd).toBeDefined();
  // qty is 8 dp
  expect(validateLotForm({ ...base, qty: '1.123456789' }).errors.qty).toBeDefined();
});

test('non-positive price, qty, or fx is rejected', () => {
  expect(validateLotForm({ ...base, qty: '0' }).errors.qty).toBeDefined();
  expect(validateLotForm({ ...base, priceUsd: '0' }).errors.priceUsd).toBeDefined();
  expect(validateLotForm({ ...base, fxRateUsdThb: '0' }).errors.fxRateUsdThb).toBeDefined();
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npm test -- lotForm`
Expected: FAIL — cannot find module `../lotForm`.

- [ ] **Step 7: Implement the lot form model**

Create `src/ui/lotForm.ts`:

```ts
import Decimal from 'decimal.js';
import { parseInput, InvalidNumberError, DP } from '../core/money';
import { isValidYmd } from './dateInput';
import type { NewLotInput } from '../services/ledger';

export interface LotFormState {
  symbolId: number | null;
  buyDate: string;
  priceUsd: string;
  qty: string;
  fxRateUsdThb: string;
  evidenceFile: string | null;
}

export type LotFormErrors = Partial<
  Record<'symbol' | 'buyDate' | 'priceUsd' | 'qty' | 'fxRateUsdThb', string>
>;

export interface LotFormResult {
  input: NewLotInput | null;
  errors: LotFormErrors;
}

/** Parses one positive decimal field, returning the Decimal or an error message. */
function positive(text: string, dp: number, label: string): { value?: Decimal; error?: string } {
  let value: Decimal;
  try {
    value = parseInput(text, dp);
  } catch (e) {
    if (e instanceof InvalidNumberError) return { error: `${label}ไม่ถูกต้อง` };
    throw e;
  }
  if (value.lessThanOrEqualTo(0)) return { error: `${label}ต้องมากกว่า 0` };
  return { value };
}

export function validateLotForm(state: LotFormState): LotFormResult {
  const errors: LotFormErrors = {};

  if (state.symbolId === null) errors.symbol = 'เลือกหรือเพิ่มสัญลักษณ์ก่อน';
  if (!isValidYmd(state.buyDate)) errors.buyDate = 'วันที่ไม่ถูกต้อง';

  const price = positive(state.priceUsd, DP.price, 'ราคา');
  if (price.error) errors.priceUsd = price.error;
  const qty = positive(state.qty, DP.qty, 'จำนวน');
  if (qty.error) errors.qty = qty.error;
  const fx = positive(state.fxRateUsdThb, DP.fxRate, 'เรตแลกเงิน');
  if (fx.error) errors.fxRateUsdThb = fx.error;

  if (Object.keys(errors).length > 0) return { input: null, errors };

  return {
    errors: {},
    input: {
      symbolId: state.symbolId!,
      buyDate: state.buyDate,
      priceUsd: price.value!,
      qty: qty.value!,
      fxRateUsdThb: fx.value!,
      evidenceFile: state.evidenceFile,
    },
  };
}
```

- [ ] **Step 8: Run to verify passing**

Run: `npm test -- lotForm`
Expected: PASS (all cases).

- [ ] **Step 9: Build the DateField component**

Create `src/ui/components/DateField.tsx`. Uses `@react-native-community/datetimepicker`. Shows the current value as a tappable field; opening the native picker and confirming calls `onChange` with a `'YYYY-MM-DD'` string.

```tsx
import { useState } from 'react';
import { Platform, Pressable, Text, StyleSheet } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { FormField } from './Field';
import { isValidYmd, todayYmd } from '../dateInput';
import { color, space, radius, font, fontFamily } from '../../theme/tokens';

export function DateField({
  label, value, onChange, error,
}: {
  label: string;
  value: string;
  onChange: (ymd: string) => void;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  const current = isValidYmd(value) ? new Date(`${value}T00:00:00`) : new Date(`${todayYmd()}T00:00:00`);

  function handle(event: DateTimePickerEvent, date?: Date) {
    setShow(false);
    if (event.type === 'set' && date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      onChange(`${y}-${m}-${d}`);
    }
  }

  return (
    <FormField label={label} error={error}>
      <Pressable onPress={() => setShow(true)} style={[styles.box, error ? styles.boxError : null]}>
        <Text style={styles.text}>{value || 'เลือกวันที่'}</Text>
      </Pressable>
      {show ? (
        <DateTimePicker value={current} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={handle} />
      ) : null}
    </FormField>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: color.inputBg, borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.md, paddingVertical: space[2], paddingHorizontal: space[3] },
  boxError: { borderColor: color.loss },
  text: { color: color.textBody, fontFamily: fontFamily.monoRegular, fontSize: font.size.md },
});
```

Install the picker (if not already present from Task 1): `npx expo install @react-native-community/datetimepicker`.

- [ ] **Step 10: Build the add-lot form screen**

Create `src/app/lot/new.tsx`. Holds form state, the symbol combo (with inline add), the date field, three decimal inputs, and a save button. On save: validate, call `addLot`, reload, navigate back. Duplicate-ticker on add is caught.

```tsx
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { Button } from '../../ui/components/Button';
import { FormField, DecimalInput } from '../../ui/components/Field';
import { DateField } from '../../ui/components/DateField';
import { SymbolCombo } from '../../ui/components/SymbolCombo';
import { useAppStore } from '../../store/useAppStore';
import { listSymbols, createSymbol, DuplicateTickerError } from '../../db/repo';
import type { SymbolRow } from '../../core/types';
import { addLot } from '../../services/ledger';
import { validateLotForm, type LotFormState, type LotFormErrors } from '../../ui/lotForm';
import { todayYmd } from '../../ui/dateInput';

export default function NewLotScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const symbols = useMemo(() => listSymbols(db), [db, dataVersion]);

  const [query, setQuery] = useState('');
  const [form, setForm] = useState<LotFormState>({
    symbolId: null, buyDate: todayYmd(), priceUsd: '', qty: '', fxRateUsdThb: '', evidenceFile: null,
  });
  const [errors, setErrors] = useState<LotFormErrors>({});

  function pick(symbol: SymbolRow) {
    setForm((f) => ({ ...f, symbolId: symbol.id }));
    setQuery(symbol.ticker);
  }

  function add(ticker: string) {
    try {
      const created = createSymbol(db, ticker);
      reload();
      pick(created);
    } catch (e) {
      if (e instanceof DuplicateTickerError) Alert.alert('มีสัญลักษณ์นี้แล้ว', ticker);
      else throw e;
    }
  }

  function save() {
    const { input, errors: errs } = validateLotForm(form);
    setErrors(errs);
    if (!input) return;
    addLot(db, input);
    reload();
    router.back();
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'บันทึกการซื้อ', headerShown: true }} />
      <SymbolCombo
        symbols={symbols} query={query} symbolId={form.symbolId}
        onPick={pick} onAdd={add}
        onChangeQuery={(t) => { setQuery(t); setForm((f) => ({ ...f, symbolId: null })); }}
        error={errors.symbol}
      />
      <DateField label="วันที่ซื้อ" value={form.buyDate} onChange={(buyDate) => setForm((f) => ({ ...f, buyDate }))} error={errors.buyDate} />
      <FormField label="ราคา (USD)" error={errors.priceUsd}>
        <DecimalInput value={form.priceUsd} onChangeText={(priceUsd) => setForm((f) => ({ ...f, priceUsd }))} placeholder="142.35" />
      </FormField>
      <FormField label="จำนวน" error={errors.qty}>
        <DecimalInput value={form.qty} onChangeText={(qty) => setForm((f) => ({ ...f, qty }))} placeholder="10" />
      </FormField>
      <FormField label="เรตแลกเงิน USD/THB" error={errors.fxRateUsdThb}>
        <DecimalInput value={form.fxRateUsdThb} onChangeText={(fxRateUsdThb) => setForm((f) => ({ ...f, fxRateUsdThb }))} placeholder="36.21" />
      </FormField>
      <Button title="บันทึก" onPress={save} />
    </Screen>
  );
}
```

- [ ] **Step 11: Build the lots list**

Replace `src/app/(tabs)/lots.tsx`. Loads lots + the symbol map + allocations (to compute remaining qty via `lotQtyRemaining`), keyed on `dataVersion`; a "+" header button routes to `lot/new`; each row routes to `lot/[id]`.

```tsx
import { useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { ListRow } from '../../ui/components/ListRow';
import { EmptyState } from '../../ui/components/EmptyState';
import { Button } from '../../ui/components/Button';
import { useAppStore } from '../../store/useAppStore';
import { listLots, listSymbols, listAllocations } from '../../db/repo';
import { toDomainLot } from '../../services/ledger';
import { lotQtyRemaining } from '../../core/derive';
import { fromStored } from '../../core/money';
import { formatQty, formatPrice } from '../../ui/format';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function LotsScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const router = useRouter();

  const { rows, tickerById } = useMemo(() => {
    const symbols = listSymbols(db);
    const tickerById = new Map(symbols.map((s) => [s.id, s.ticker]));
    const allocations = listAllocations(db).map((a) => ({
      saleId: a.saleId, lotId: a.lotId, qtyAllocated: fromStored(a.qtyAllocated), costBasisThb: fromStored(a.costBasisThb),
    }));
    const rows = listLots(db).map(toDomainLot).map((lot) => ({
      lot, remaining: lotQtyRemaining(lot, allocations),
    }));
    return { rows, tickerById };
  }, [db, dataVersion]);

  return (
    <Screen scroll>
      <Stack.Screen options={{ headerShown: false }} />
      <Button title="+ บันทึกการซื้อ" onPress={() => router.push('/lot/new')} style={{ marginBottom: space[3] }} />
      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีรายการซื้อ" hint="กดปุ่มด้านบนเพื่อบันทึกล็อตแรก" />
      ) : (
        rows.map(({ lot, remaining }) => (
          <ListRow key={lot.id} onPress={() => router.push(`/lot/${lot.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ticker}>{tickerById.get(lot.symbolId) ?? '—'}</Text>
              <Text style={styles.meta}>{lot.buyDate} · {formatPrice(lot.priceUsd)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.qty}>{formatQty(lot.qty)}</Text>
              <Text style={styles.meta}>เหลือ {formatQty(remaining)}</Text>
            </View>
          </ListRow>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ticker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
  qty: { color: color.textBody, fontFamily: fontFamily.monoMedium, fontSize: font.size.md },
  meta: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
});
```

- [ ] **Step 12: Build the lot detail screen (with delete)**

Create `src/app/lot/[id].tsx`. Shows the lot's fields and cost basis; offers Edit (→ `lot/[id]/edit`) and Delete (confirm → `deleteLot` → reload → back). Evidence thumbnail is added in Task 8.

```tsx
import { useMemo } from 'react';
import { Text, View, Alert, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { Card, CardTitle } from '../../ui/components/Card';
import { Button } from '../../ui/components/Button';
import { EmptyState } from '../../ui/components/EmptyState';
import { useAppStore } from '../../store/useAppStore';
import { getLot, listSymbols } from '../../db/repo';
import { toDomainLot, deleteLot } from '../../services/ledger';
import { lotCostThb } from '../../core/derive';
import { formatQty, formatPrice, formatFxRate, formatMoneyThb } from '../../ui/format';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function LotDetailScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lotId = Number(id);

  const data = useMemo(() => {
    const row = getLot(db, lotId);
    if (!row) return null;
    const lot = toDomainLot(row);
    const ticker = listSymbols(db).find((s) => s.id === lot.symbolId)?.ticker ?? '—';
    return { lot, ticker, cost: lotCostThb(lot) };
  }, [db, dataVersion, lotId]);

  if (!data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'ไม่พบล็อต', headerShown: true }} />
        <EmptyState title="ไม่พบรายการนี้" hint="อาจถูกลบไปแล้ว" />
      </Screen>
    );
  }

  function remove() {
    Alert.alert('ลบการซื้อ', 'ยืนยันการลบล็อตนี้? การจัดสรรจะถูกคำนวณใหม่ทั้งหมด', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบ', style: 'destructive', onPress: () => { deleteLot(db, lotId); reload(); router.back(); } },
    ]);
  }

  const { lot, ticker, cost } = data;
  return (
    <Screen scroll>
      <Stack.Screen options={{ title: `${ticker} · ซื้อ`, headerShown: true }} />
      <Card>
        <CardTitle>{ticker}</CardTitle>
        <Row label="วันที่ซื้อ" value={lot.buyDate} />
        <Row label="ราคา (USD)" value={formatPrice(lot.priceUsd)} />
        <Row label="จำนวน" value={formatQty(lot.qty)} />
        <Row label="เรต USD/THB" value={formatFxRate(lot.fxRateUsdThb)} />
        <Row label="ต้นทุนรวม" value={formatMoneyThb(cost)} />
      </Card>
      <View style={styles.actions}>
        <Button title="แก้ไข" variant="outline" onPress={() => router.push(`/lot/${lotId}/edit`)} style={{ flex: 1 }} />
        <Button title="ลบ" variant="danger" onPress={remove} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space[2] },
  label: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm },
  value: { color: color.textBody, fontFamily: fontFamily.monoMedium, fontSize: font.size.sm },
  actions: { flexDirection: 'row', gap: space[3], marginTop: space[4] },
});
```

- [ ] **Step 13: Build the edit-lot form screen**

Create `src/app/lot/[id]/edit.tsx`. Same form as add, pre-filled from the existing lot, calling `editLot`. The symbol combo shows the current ticker and allows changing it.

```tsx
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../../ui/components/Screen';
import { Button } from '../../../ui/components/Button';
import { FormField, DecimalInput } from '../../../ui/components/Field';
import { DateField } from '../../../ui/components/DateField';
import { SymbolCombo } from '../../../ui/components/SymbolCombo';
import { EmptyState } from '../../../ui/components/EmptyState';
import { useAppStore } from '../../../store/useAppStore';
import { listSymbols, getLot, createSymbol, DuplicateTickerError } from '../../../db/repo';
import type { SymbolRow } from '../../../core/types';
import { editLot } from '../../../services/ledger';
import { validateLotForm, type LotFormState, type LotFormErrors } from '../../../ui/lotForm';

export default function EditLotScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lotId = Number(id);

  const symbols = useMemo(() => listSymbols(db), [db, dataVersion]);
  const existing = useMemo(() => getLot(db, lotId), [db, lotId]);

  const initialTicker = existing ? (symbols.find((s) => s.id === existing.symbolId)?.ticker ?? '') : '';
  const [query, setQuery] = useState(initialTicker);
  const [form, setForm] = useState<LotFormState | null>(
    existing
      ? {
          symbolId: existing.symbolId,
          buyDate: existing.buyDate,
          priceUsd: existing.priceUsd,
          qty: existing.qty,
          fxRateUsdThb: existing.fxRateUsdThb,
          evidenceFile: existing.evidenceFile,
        }
      : null,
  );
  const [errors, setErrors] = useState<LotFormErrors>({});

  if (!existing || !form) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'แก้ไขการซื้อ', headerShown: true }} />
        <EmptyState title="ไม่พบรายการนี้" />
      </Screen>
    );
  }

  function pick(symbol: SymbolRow) { setForm((f) => (f ? { ...f, symbolId: symbol.id } : f)); setQuery(symbol.ticker); }
  function add(ticker: string) {
    try { const c = createSymbol(db, ticker); reload(); pick(c); }
    catch (e) { if (e instanceof DuplicateTickerError) Alert.alert('มีสัญลักษณ์นี้แล้ว', ticker); else throw e; }
  }
  function save() {
    const { input, errors: errs } = validateLotForm(form!);
    setErrors(errs);
    if (!input) return;
    editLot(db, lotId, input);
    reload();
    router.back();
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'แก้ไขการซื้อ', headerShown: true }} />
      <SymbolCombo
        symbols={symbols} query={query} symbolId={form.symbolId}
        onPick={pick} onAdd={add}
        onChangeQuery={(t) => { setQuery(t); setForm((f) => (f ? { ...f, symbolId: null } : f)); }}
        error={errors.symbol}
      />
      <DateField label="วันที่ซื้อ" value={form.buyDate} onChange={(buyDate) => setForm((f) => (f ? { ...f, buyDate } : f))} error={errors.buyDate} />
      <FormField label="ราคา (USD)" error={errors.priceUsd}>
        <DecimalInput value={form.priceUsd} onChangeText={(priceUsd) => setForm((f) => (f ? { ...f, priceUsd } : f))} />
      </FormField>
      <FormField label="จำนวน" error={errors.qty}>
        <DecimalInput value={form.qty} onChangeText={(qty) => setForm((f) => (f ? { ...f, qty } : f))} />
      </FormField>
      <FormField label="เรตแลกเงิน USD/THB" error={errors.fxRateUsdThb}>
        <DecimalInput value={form.fxRateUsdThb} onChangeText={(fxRateUsdThb) => setForm((f) => (f ? { ...f, fxRateUsdThb } : f))} />
      </FormField>
      <Button title="บันทึกการแก้ไข" onPress={save} />
    </Screen>
  );
}
```

The pre-filled decimal fields are the stored fixed-precision strings (e.g. `"142.350000"`); they display verbatim and `validateLotForm` re-parses them on save, so no conversion is needed here.

- [ ] **Step 14: Register lot route titles and typecheck**

Expo Router auto-registers every file under `src/app/`, so the `lot/*` screens already work. The per-screen `<Stack.Screen options>` inside each screen sets its title. No change to `_layout.tsx` is required unless you prefer to centralize titles; if so, add `<Stack.Screen name="lot/[id]" />` etc. — but the in-screen options are sufficient. Delete this step's `_layout.tsx` modification from the Files list if you rely on in-screen options (recommended).

Run: `npm run typecheck` → passes.

- [ ] **Step 15: Test, manual-verify, commit**

Run: `npm test` → green (dateInput + lotForm tests added).
Manual verification (`npx expo start`, native):
1. ซื้อ tab → "+ บันทึกการซื้อ". Type `nvda`; the dropdown offers `เพิ่ม "NVDA"`; tap it — the field shows NVDA and the dropdown closes.
2. Pick a date via the native picker; type price `142.35`, qty `10`, fx `36.21`; save. You return to the list showing one NVDA row, `เหลือ 10`.
3. Try an invalid entry (qty `0`, or price `1,000`) — the field shows a Thai error and save is blocked.
4. Tap the row → detail shows ต้นทุนรวม. Edit it (change qty to `8`), save — the list updates to `เหลือ 8`.
5. Delete it — confirm dialog, then the list returns to the empty state.
6. Re-check เพิ่มเติม → จัดการสัญลักษณ์: NVDA now appears (create one again if you deleted its lots) with its usage counts; deleting a referenced symbol is disabled.

```bash
git add -A
git commit -m "feat: add lot entry form, lots list, and lot detail with edit/delete"
```

---

### Task 7: Sale form, sales list, and the signature sale-detail screen

**Files:**
- Create: `src/ui/saleForm.ts`
- Test: `src/ui/__tests__/saleForm.test.ts`
- Create: `src/ui/saleDetail.ts`
- Test: `src/ui/__tests__/saleDetail.test.ts`
- Create: `src/app/sale/new.tsx`
- Create: `src/app/sale/[id].tsx`
- Create: `src/app/sale/[id]/edit.tsx`
- Modify: `src/app/(tabs)/sales.tsx` (the real list)

**Interfaces:**
- Consumes: `parseInput`, `InvalidNumberError`, `DP`, `fromStored` from `src/core/money.ts`; `NewSaleInput`, `addSale`, `editSale`, `deleteSale`, `toDomainSale`, `toDomainLot` from `src/services/ledger.ts`; `InsufficientLotsError` from `src/core/fifo.ts`; `saleProceedsThb`, `saleCostBasisThb`, `saleCapitalGainThb` from `src/core/derive.ts`; `listSales`, `getSale`, `listLots`, `listAllocations`, `listSymbols`, `createSymbol`, `DuplicateTickerError` from `src/db/repo.ts`; `isValidYmd`, `todayYmd` from `src/ui/dateInput.ts`; the `SymbolCombo`, `DateField`, formatters, components, store.
- Produces:
  - `src/ui/saleForm.ts` → `interface SaleFormState`, `type SaleFormErrors`, `interface SaleFormResult`, `function validateSaleForm(state: SaleFormState): SaleFormResult`. Mirrors `lotForm` but adds `feeUsd` (empty is treated as `0`; must be ≥ 0) and uses `qtySold`/`salePriceUsd`/`sellDate`.
  - `src/ui/saleDetail.ts` → `interface SaleDetailLine { lotId: number; buyDate: string; qtyAllocated: Decimal; costBasisThb: Decimal }`, `interface SaleDetail { symbol: SymbolRow; sale: Sale; lines: SaleDetailLine[]; proceedsThb: Decimal; costBasisThb: Decimal; capitalGainThb: Decimal }`, and `function buildSaleDetail(symbol: SymbolRow, sale: Sale, lots: readonly Lot[], allocations: readonly Allocation[]): SaleDetail`. Lines are this sale's allocations joined to their lot's `buyDate`, ordered oldest-lot-first (the FIFO order the sale consumed them in).

- [ ] **Step 1: Write the failing sale-form tests**

Create `src/ui/__tests__/saleForm.test.ts`:

```ts
import Decimal from 'decimal.js';
import { validateSaleForm, type SaleFormState } from '../saleForm';

const base: SaleFormState = {
  symbolId: 1, sellDate: '2026-04-01', qtySold: '5', salePriceUsd: '150', feeUsd: '', fxRateUsdThb: '36.5', evidenceFile: null,
};

test('valid form with empty fee defaults fee to 0', () => {
  const { input, errors } = validateSaleForm(base);
  expect(errors).toEqual({});
  expect(input).not.toBeNull();
  expect(input!.feeUsd).toBeInstanceOf(Decimal);
  expect(input!.feeUsd.toString()).toBe('0');
  expect(input!.qtySold.toString()).toBe('5');
});

test('explicit fee is parsed', () => {
  const { input } = validateSaleForm({ ...base, feeUsd: '1.25' });
  expect(input!.feeUsd.toString()).toBe('1.25');
});

test('negative fee is rejected; zero fee is allowed', () => {
  expect(validateSaleForm({ ...base, feeUsd: '-1' }).errors.feeUsd).toBeDefined();
  expect(validateSaleForm({ ...base, feeUsd: '0' }).errors.feeUsd).toBeUndefined();
});

test('missing symbol, bad date, non-positive qty/price/fx are errors', () => {
  expect(validateSaleForm({ ...base, symbolId: null }).errors.symbol).toBeDefined();
  expect(validateSaleForm({ ...base, sellDate: '2026-02-31' }).errors.sellDate).toBeDefined();
  expect(validateSaleForm({ ...base, qtySold: '0' }).errors.qtySold).toBeDefined();
  expect(validateSaleForm({ ...base, salePriceUsd: '0' }).errors.salePriceUsd).toBeDefined();
  expect(validateSaleForm({ ...base, fxRateUsdThb: '0' }).errors.fxRateUsdThb).toBeDefined();
});

test('comma/exponent and over-precision are rejected', () => {
  expect(validateSaleForm({ ...base, qtySold: '1,000' }).errors.qtySold).toBeDefined();
  expect(validateSaleForm({ ...base, salePriceUsd: '1.1234567' }).errors.salePriceUsd).toBeDefined(); // price 6 dp
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- saleForm`
Expected: FAIL — cannot find module `../saleForm`.

- [ ] **Step 3: Implement the sale form model**

Create `src/ui/saleForm.ts`:

```ts
import Decimal from 'decimal.js';
import { parseInput, InvalidNumberError, DP } from '../core/money';
import { isValidYmd } from './dateInput';
import type { NewSaleInput } from '../services/ledger';

export interface SaleFormState {
  symbolId: number | null;
  sellDate: string;
  qtySold: string;
  salePriceUsd: string;
  feeUsd: string;
  fxRateUsdThb: string;
  evidenceFile: string | null;
}

export type SaleFormErrors = Partial<
  Record<'symbol' | 'sellDate' | 'qtySold' | 'salePriceUsd' | 'feeUsd' | 'fxRateUsdThb', string>
>;

export interface SaleFormResult {
  input: NewSaleInput | null;
  errors: SaleFormErrors;
}

function positive(text: string, dp: number, label: string): { value?: Decimal; error?: string } {
  let value: Decimal;
  try {
    value = parseInput(text, dp);
  } catch (e) {
    if (e instanceof InvalidNumberError) return { error: `${label}ไม่ถูกต้อง` };
    throw e;
  }
  if (value.lessThanOrEqualTo(0)) return { error: `${label}ต้องมากกว่า 0` };
  return { value };
}

/** Fee: empty means 0; otherwise a non-negative decimal. */
function fee(text: string): { value?: Decimal; error?: string } {
  if (text.trim() === '') return { value: new Decimal(0) };
  let value: Decimal;
  try {
    value = parseInput(text, DP.money);
  } catch (e) {
    if (e instanceof InvalidNumberError) return { error: 'ค่าธรรมเนียมไม่ถูกต้อง' };
    throw e;
  }
  if (value.lessThan(0)) return { error: 'ค่าธรรมเนียมต้องไม่ติดลบ' };
  return { value };
}

export function validateSaleForm(state: SaleFormState): SaleFormResult {
  const errors: SaleFormErrors = {};

  if (state.symbolId === null) errors.symbol = 'เลือกหรือเพิ่มสัญลักษณ์ก่อน';
  if (!isValidYmd(state.sellDate)) errors.sellDate = 'วันที่ไม่ถูกต้อง';

  const qty = positive(state.qtySold, DP.qty, 'จำนวน');
  if (qty.error) errors.qtySold = qty.error;
  const price = positive(state.salePriceUsd, DP.price, 'ราคาขาย');
  if (price.error) errors.salePriceUsd = price.error;
  const fx = positive(state.fxRateUsdThb, DP.fxRate, 'เรตแลกเงิน');
  if (fx.error) errors.fxRateUsdThb = fx.error;
  const f = fee(state.feeUsd);
  if (f.error) errors.feeUsd = f.error;

  if (Object.keys(errors).length > 0) return { input: null, errors };

  return {
    errors: {},
    input: {
      symbolId: state.symbolId!,
      sellDate: state.sellDate,
      qtySold: qty.value!,
      salePriceUsd: price.value!,
      feeUsd: f.value!,
      fxRateUsdThb: fx.value!,
      evidenceFile: state.evidenceFile,
    },
  };
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm test -- saleForm`
Expected: PASS.

- [ ] **Step 5: Write the failing sale-detail tests**

Create `src/ui/__tests__/saleDetail.test.ts`:

```ts
import Decimal from 'decimal.js';
import { buildSaleDetail } from '../saleDetail';
import type { Lot, Sale, Allocation, SymbolRow } from '../../core/types';

const symbol: SymbolRow = { id: 1, ticker: 'NVDA', name: 'NVIDIA' };

function lot(id: number, buyDate: string): Lot {
  return { id, symbolId: 1, buyDate, priceUsd: new Decimal(0), qty: new Decimal(0), fxRateUsdThb: new Decimal(0), createdAt: '', evidenceFile: null };
}

const sale: Sale = {
  id: 5, symbolId: 1, sellDate: '2026-04-01',
  qtySold: new Decimal('5'), salePriceUsd: new Decimal('100'), feeUsd: new Decimal('0'), fxRateUsdThb: new Decimal('35'),
  createdAt: '', evidenceFile: null,
};

const lots: Lot[] = [lot(10, '2026-01-02'), lot(11, '2026-01-01')];
const allocations: Allocation[] = [
  { saleId: 5, lotId: 10, qtyAllocated: new Decimal('2'), costBasisThb: new Decimal('7000') },
  { saleId: 5, lotId: 11, qtyAllocated: new Decimal('3'), costBasisThb: new Decimal('9000') },
  { saleId: 99, lotId: 10, qtyAllocated: new Decimal('1'), costBasisThb: new Decimal('3500') }, // other sale — ignored
];

test('lines are this sale only, joined to lot buy dates, oldest lot first', () => {
  const d = buildSaleDetail(symbol, sale, lots, allocations);
  expect(d.lines.map((l) => l.lotId)).toEqual([11, 10]); // 2026-01-01 before 2026-01-02
  expect(d.lines.map((l) => l.buyDate)).toEqual(['2026-01-01', '2026-01-02']);
});

test('totals match the derive helpers', () => {
  const d = buildSaleDetail(symbol, sale, lots, allocations);
  expect(d.costBasisThb.equals('16000')).toBe(true);       // 7000 + 9000
  expect(d.proceedsThb.equals('17500')).toBe(true);         // 100*5*35
  expect(d.capitalGainThb.equals('1500')).toBe(true);       // 17500 - 16000
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npm test -- saleDetail`
Expected: FAIL — cannot find module `../saleDetail`.

- [ ] **Step 7: Implement the sale-detail view model**

Create `src/ui/saleDetail.ts`:

```ts
import type Decimal from 'decimal.js';
import type { Allocation, Lot, Sale, SymbolRow } from '../core/types';
import { saleProceedsThb, saleCostBasisThb, saleCapitalGainThb } from '../core/derive';

export interface SaleDetailLine {
  lotId: number;
  buyDate: string;
  qtyAllocated: Decimal;
  costBasisThb: Decimal;
}

export interface SaleDetail {
  symbol: SymbolRow;
  sale: Sale;
  lines: SaleDetailLine[];
  proceedsThb: Decimal;
  costBasisThb: Decimal;
  capitalGainThb: Decimal;
}

export function buildSaleDetail(
  symbol: SymbolRow,
  sale: Sale,
  lots: readonly Lot[],
  allocations: readonly Allocation[],
): SaleDetail {
  const buyDateByLot = new Map(lots.map((lot) => [lot.id, lot.buyDate]));
  const lines: SaleDetailLine[] = allocations
    .filter((a) => a.saleId === sale.id)
    .map((a) => ({
      lotId: a.lotId,
      buyDate: buyDateByLot.get(a.lotId) ?? '',
      qtyAllocated: a.qtyAllocated,
      costBasisThb: a.costBasisThb,
    }))
    .sort((x, y) => (x.buyDate < y.buyDate ? -1 : x.buyDate > y.buyDate ? 1 : x.lotId - y.lotId));

  return {
    symbol,
    sale,
    lines,
    proceedsThb: saleProceedsThb(sale),
    costBasisThb: saleCostBasisThb(sale, allocations),
    capitalGainThb: saleCapitalGainThb(sale, allocations),
  };
}
```

- [ ] **Step 8: Run to verify passing**

Run: `npm test -- saleDetail`
Expected: PASS.

- [ ] **Step 9: Build the add-sale form screen**

Create `src/app/sale/new.tsx`. Like the lot form, plus a fee field, and it catches `InsufficientLotsError` (thrown by the ledger rebuild, spec §3.2) to show a specific Thai message built from the error's structured fields and the chosen ticker.

```tsx
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { Button } from '../../ui/components/Button';
import { FormField, DecimalInput } from '../../ui/components/Field';
import { DateField } from '../../ui/components/DateField';
import { SymbolCombo } from '../../ui/components/SymbolCombo';
import { useAppStore } from '../../store/useAppStore';
import { listSymbols, createSymbol, DuplicateTickerError } from '../../db/repo';
import type { SymbolRow } from '../../core/types';
import { addSale } from '../../services/ledger';
import { InsufficientLotsError } from '../../core/fifo';
import { validateSaleForm, type SaleFormState, type SaleFormErrors } from '../../ui/saleForm';
import { todayYmd } from '../../ui/dateInput';
import { formatQty } from '../../ui/format';

export default function NewSaleScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const symbols = useMemo(() => listSymbols(db), [db, dataVersion]);

  const [query, setQuery] = useState('');
  const [form, setForm] = useState<SaleFormState>({
    symbolId: null, sellDate: todayYmd(), qtySold: '', salePriceUsd: '', feeUsd: '', fxRateUsdThb: '', evidenceFile: null,
  });
  const [errors, setErrors] = useState<SaleFormErrors>({});

  function pick(symbol: SymbolRow) { setForm((f) => ({ ...f, symbolId: symbol.id })); setQuery(symbol.ticker); }
  function add(ticker: string) {
    try { const c = createSymbol(db, ticker); reload(); pick(c); }
    catch (e) { if (e instanceof DuplicateTickerError) Alert.alert('มีสัญลักษณ์นี้แล้ว', ticker); else throw e; }
  }

  function save() {
    const { input, errors: errs } = validateSaleForm(form);
    setErrors(errs);
    if (!input) return;
    try {
      addSale(db, input);
      reload();
      router.back();
    } catch (e) {
      if (e instanceof InsufficientLotsError) {
        const ticker = symbols.find((s) => s.id === e.symbolId)?.ticker ?? '';
        Alert.alert(
          'จำนวนไม่พอขาย',
          `ขาย ${ticker} จำนวน ${formatQty(e.requested)} ในวันที่ ${e.sellDate} ไม่ได้ — มีอยู่เพียง ${formatQty(e.available)} ณ วันนั้น`,
        );
      } else throw e;
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'บันทึกการขาย', headerShown: true }} />
      <SymbolCombo
        symbols={symbols} query={query} symbolId={form.symbolId}
        onPick={pick} onAdd={add}
        onChangeQuery={(t) => { setQuery(t); setForm((f) => ({ ...f, symbolId: null })); }}
        error={errors.symbol}
      />
      <DateField label="วันที่ขาย" value={form.sellDate} onChange={(sellDate) => setForm((f) => ({ ...f, sellDate }))} error={errors.sellDate} />
      <FormField label="จำนวนที่ขาย" error={errors.qtySold}>
        <DecimalInput value={form.qtySold} onChangeText={(qtySold) => setForm((f) => ({ ...f, qtySold }))} placeholder="5" />
      </FormField>
      <FormField label="ราคาขาย (USD)" error={errors.salePriceUsd}>
        <DecimalInput value={form.salePriceUsd} onChangeText={(salePriceUsd) => setForm((f) => ({ ...f, salePriceUsd }))} placeholder="150" />
      </FormField>
      <FormField label="ค่าธรรมเนียม (USD)" error={errors.feeUsd} helpText="เว้นว่างได้ = 0">
        <DecimalInput value={form.feeUsd} onChangeText={(feeUsd) => setForm((f) => ({ ...f, feeUsd }))} placeholder="0" />
      </FormField>
      <FormField label="เรตแลกเงิน USD/THB" error={errors.fxRateUsdThb}>
        <DecimalInput value={form.fxRateUsdThb} onChangeText={(fxRateUsdThb) => setForm((f) => ({ ...f, fxRateUsdThb }))} placeholder="36.50" />
      </FormField>
      <Button title="บันทึก" onPress={save} />
    </Screen>
  );
}
```

- [ ] **Step 10: Build the sales list**

Replace `src/app/(tabs)/sales.tsx`. Lists sales with ticker, date, qty, and the capital gain (colored), keyed on `dataVersion`; "+" routes to `sale/new`; rows route to `sale/[id]`.

```tsx
import { useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { ListRow } from '../../ui/components/ListRow';
import { EmptyState } from '../../ui/components/EmptyState';
import { Button } from '../../ui/components/Button';
import { GainLoss } from '../../ui/components/GainLoss';
import { useAppStore } from '../../store/useAppStore';
import { listSales, listAllocations, listSymbols } from '../../db/repo';
import { toDomainSale } from '../../services/ledger';
import { saleCapitalGainThb } from '../../core/derive';
import { fromStored } from '../../core/money';
import { formatQty, formatSignedThb } from '../../ui/format';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function SalesScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const router = useRouter();

  const { rows, tickerById } = useMemo(() => {
    const symbols = listSymbols(db);
    const tickerById = new Map(symbols.map((s) => [s.id, s.ticker]));
    const allocations = listAllocations(db).map((a) => ({
      saleId: a.saleId, lotId: a.lotId, qtyAllocated: fromStored(a.qtyAllocated), costBasisThb: fromStored(a.costBasisThb),
    }));
    const rows = listSales(db).map(toDomainSale).map((sale) => ({
      sale, gain: saleCapitalGainThb(sale, allocations),
    }));
    return { rows, tickerById };
  }, [db, dataVersion]);

  return (
    <Screen scroll>
      <Stack.Screen options={{ headerShown: false }} />
      <Button title="+ บันทึกการขาย" onPress={() => router.push('/sale/new')} style={{ marginBottom: space[3] }} />
      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีรายการขาย" hint="กดปุ่มด้านบนเพื่อบันทึกการขาย" />
      ) : (
        rows.map(({ sale, gain }) => (
          <ListRow key={sale.id} onPress={() => router.push(`/sale/${sale.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ticker}>{tickerById.get(sale.symbolId) ?? '—'}</Text>
              <Text style={styles.meta}>{sale.sellDate} · {formatQty(sale.qtySold)} หน่วย</Text>
            </View>
            <GainLoss value={gain.toString()} display={formatSignedThb(gain)} />
          </ListRow>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ticker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
  meta: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
});
```

- [ ] **Step 11: Build the signature sale-detail screen**

Create `src/app/sale/[id].tsx`. This is the app's signature screen (spec §7.1) — it shows exactly which lots the sale consumed, how much from each, at what cost basis, for what gain. Build the view model with `buildSaleDetail`.

```tsx
import { useMemo } from 'react';
import { Text, View, Alert, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { Card, CardTitle } from '../../ui/components/Card';
import { Button } from '../../ui/components/Button';
import { GainLoss } from '../../ui/components/GainLoss';
import { EmptyState } from '../../ui/components/EmptyState';
import { useAppStore } from '../../store/useAppStore';
import { getSale, listLots, listAllocations, listSymbols } from '../../db/repo';
import { toDomainSale, toDomainLot, deleteSale } from '../../services/ledger';
import { fromStored } from '../../core/money';
import { buildSaleDetail } from '../../ui/saleDetail';
import { formatQty, formatPrice, formatFxRate, formatMoneyThb, formatSignedThb } from '../../ui/format';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function SaleDetailScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const saleId = Number(id);

  const detail = useMemo(() => {
    const row = getSale(db, saleId);
    if (!row) return null;
    const sale = toDomainSale(row);
    const symbol = listSymbols(db).find((s) => s.id === sale.symbolId) ?? { id: sale.symbolId, ticker: '—', name: '' };
    const lots = listLots(db).map(toDomainLot);
    const allocations = listAllocations(db).map((a) => ({
      saleId: a.saleId, lotId: a.lotId, qtyAllocated: fromStored(a.qtyAllocated), costBasisThb: fromStored(a.costBasisThb),
    }));
    return buildSaleDetail(symbol, sale, lots, allocations);
  }, [db, dataVersion, saleId]);

  if (!detail) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'ไม่พบการขาย', headerShown: true }} />
        <EmptyState title="ไม่พบรายการนี้" hint="อาจถูกลบไปแล้ว" />
      </Screen>
    );
  }

  function remove() {
    Alert.alert('ลบการขาย', 'ยืนยันการลบ? การจัดสรรจะถูกคำนวณใหม่ทั้งหมด', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบ', style: 'destructive', onPress: () => { deleteSale(db, saleId); reload(); router.back(); } },
    ]);
  }

  const { symbol, sale, lines, proceedsThb, costBasisThb, capitalGainThb } = detail;
  return (
    <Screen scroll>
      <Stack.Screen options={{ title: `${symbol.ticker} · ขาย`, headerShown: true }} />
      <Card>
        <CardTitle>{symbol.ticker}</CardTitle>
        <Row label="วันที่ขาย" value={sale.sellDate} />
        <Row label="จำนวนที่ขาย" value={formatQty(sale.qtySold)} />
        <Row label="ราคาขาย (USD)" value={formatPrice(sale.salePriceUsd)} />
        <Row label="เรต USD/THB" value={formatFxRate(sale.fxRateUsdThb)} />
        <Row label="รายรับ" value={formatMoneyThb(proceedsThb)} />
        <Row label="ต้นทุน (FIFO)" value={formatMoneyThb(costBasisThb)} />
        <View style={styles.gainRow}>
          <Text style={styles.gainLabel}>กำไร/ขาดทุน</Text>
          <GainLoss value={capitalGainThb.toString()} display={formatSignedThb(capitalGainThb)} />
        </View>
      </Card>

      <Card style={{ marginTop: space[3] }}>
        <CardTitle>ขายจากล็อต (เก่าสุดก่อน)</CardTitle>
        {lines.map((line) => (
          <View key={line.lotId} style={styles.allocRow}>
            <View>
              <Text style={styles.allocDate}>{line.buyDate}</Text>
              <Text style={styles.allocMeta}>ล็อต #{line.lotId}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.allocQty}>{formatQty(line.qtyAllocated)} หน่วย</Text>
              <Text style={styles.allocMeta}>ต้นทุน {formatMoneyThb(line.costBasisThb)}</Text>
            </View>
          </View>
        ))}
      </Card>

      <View style={styles.actions}>
        <Button title="แก้ไข" variant="outline" onPress={() => router.push(`/sale/${saleId}/edit`)} style={{ flex: 1 }} />
        <Button title="ลบ" variant="danger" onPress={remove} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space[2] },
  label: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm },
  value: { color: color.textBody, fontFamily: fontFamily.monoMedium, fontSize: font.size.sm },
  gainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space[3], marginTop: space[2], borderTopColor: color.cardBorder, borderTopWidth: 1 },
  gainLabel: { color: color.textBody, fontFamily: fontFamily.sansSemibold, fontSize: font.size.md },
  allocRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space[2], borderBottomColor: color.cardBorder, borderBottomWidth: StyleSheet.hairlineWidth },
  allocDate: { color: color.textBody, fontFamily: fontFamily.monoMedium, fontSize: font.size.sm },
  allocQty: { color: color.textBody, fontFamily: fontFamily.monoMedium, fontSize: font.size.sm },
  allocMeta: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space[3], marginTop: space[4] },
});
```

- [ ] **Step 12: Build the edit-sale form screen**

Create `src/app/sale/[id]/edit.tsx`, analogous to the edit-lot screen: pre-fill from `getSale`, validate with `validateSaleForm`, call `editSale`, and catch `InsufficientLotsError` the same way `sale/new.tsx` does (an edit can also make the ledger inconsistent).

```tsx
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../../ui/components/Screen';
import { Button } from '../../../ui/components/Button';
import { FormField, DecimalInput } from '../../../ui/components/Field';
import { DateField } from '../../../ui/components/DateField';
import { SymbolCombo } from '../../../ui/components/SymbolCombo';
import { EmptyState } from '../../../ui/components/EmptyState';
import { useAppStore } from '../../../store/useAppStore';
import { listSymbols, getSale, createSymbol, DuplicateTickerError } from '../../../db/repo';
import type { SymbolRow } from '../../../core/types';
import { editSale } from '../../../services/ledger';
import { InsufficientLotsError } from '../../../core/fifo';
import { validateSaleForm, type SaleFormState, type SaleFormErrors } from '../../../ui/saleForm';
import { formatQty } from '../../../ui/format';

export default function EditSaleScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const saleId = Number(id);

  const symbols = useMemo(() => listSymbols(db), [db, dataVersion]);
  const existing = useMemo(() => getSale(db, saleId), [db, saleId]);
  const initialTicker = existing ? (symbols.find((s) => s.id === existing.symbolId)?.ticker ?? '') : '';
  const [query, setQuery] = useState(initialTicker);
  const [form, setForm] = useState<SaleFormState | null>(
    existing
      ? {
          symbolId: existing.symbolId, sellDate: existing.sellDate, qtySold: existing.qtySold,
          salePriceUsd: existing.salePriceUsd, feeUsd: existing.feeUsd, fxRateUsdThb: existing.fxRateUsdThb,
          evidenceFile: existing.evidenceFile,
        }
      : null,
  );
  const [errors, setErrors] = useState<SaleFormErrors>({});

  if (!existing || !form) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'แก้ไขการขาย', headerShown: true }} />
        <EmptyState title="ไม่พบรายการนี้" />
      </Screen>
    );
  }

  function pick(symbol: SymbolRow) { setForm((f) => (f ? { ...f, symbolId: symbol.id } : f)); setQuery(symbol.ticker); }
  function add(ticker: string) {
    try { const c = createSymbol(db, ticker); reload(); pick(c); }
    catch (e) { if (e instanceof DuplicateTickerError) Alert.alert('มีสัญลักษณ์นี้แล้ว', ticker); else throw e; }
  }
  function save() {
    const { input, errors: errs } = validateSaleForm(form!);
    setErrors(errs);
    if (!input) return;
    try {
      editSale(db, saleId, input);
      reload();
      router.back();
    } catch (e) {
      if (e instanceof InsufficientLotsError) {
        const ticker = symbols.find((s) => s.id === e.symbolId)?.ticker ?? '';
        Alert.alert('จำนวนไม่พอขาย', `ขาย ${ticker} จำนวน ${formatQty(e.requested)} ในวันที่ ${e.sellDate} ไม่ได้ — มีอยู่เพียง ${formatQty(e.available)} ณ วันนั้น`);
      } else throw e;
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'แก้ไขการขาย', headerShown: true }} />
      <SymbolCombo
        symbols={symbols} query={query} symbolId={form.symbolId}
        onPick={pick} onAdd={add}
        onChangeQuery={(t) => { setQuery(t); setForm((f) => (f ? { ...f, symbolId: null } : f)); }}
        error={errors.symbol}
      />
      <DateField label="วันที่ขาย" value={form.sellDate} onChange={(sellDate) => setForm((f) => (f ? { ...f, sellDate } : f))} error={errors.sellDate} />
      <FormField label="จำนวนที่ขาย" error={errors.qtySold}>
        <DecimalInput value={form.qtySold} onChangeText={(qtySold) => setForm((f) => (f ? { ...f, qtySold } : f))} />
      </FormField>
      <FormField label="ราคาขาย (USD)" error={errors.salePriceUsd}>
        <DecimalInput value={form.salePriceUsd} onChangeText={(salePriceUsd) => setForm((f) => (f ? { ...f, salePriceUsd } : f))} />
      </FormField>
      <FormField label="ค่าธรรมเนียม (USD)" error={errors.feeUsd} helpText="เว้นว่างได้ = 0">
        <DecimalInput value={form.feeUsd} onChangeText={(feeUsd) => setForm((f) => (f ? { ...f, feeUsd } : f))} />
      </FormField>
      <FormField label="เรตแลกเงิน USD/THB" error={errors.fxRateUsdThb}>
        <DecimalInput value={form.fxRateUsdThb} onChangeText={(fxRateUsdThb) => setForm((f) => (f ? { ...f, fxRateUsdThb } : f))} />
      </FormField>
      <Button title="บันทึกการแก้ไข" onPress={save} />
    </Screen>
  );
}
```

- [ ] **Step 13: Typecheck, test, manual-verify, commit**

Run: `npm run typecheck` → passes.
Run: `npm test` → green (saleForm + saleDetail tests added).
Manual verification (`npx expo start`, native) — run the full FIFO flow:
1. Add two NVDA lots (from the ซื้อ tab): 10 @ 100 on 2026-01-01, 5 @ 110 on 2026-01-02, fx 36 for both.
2. ขาย tab → "+ บันทึกการขาย": sell NVDA 12 @ 150 on 2026-02-01, fx 36. Save succeeds.
3. Tap the sale → the detail shows **two** allocation lines: 2026-01-01 taking 10 units, 2026-01-02 taking 2 units (FIFO, oldest first), each with its cost basis; the gain is colored green/red.
4. Try to oversell: sell NVDA 100 @ 150 on 2026-02-01 — the form shows the Thai "จำนวนไม่พอขาย … มีอยู่เพียง 3 …" message and nothing is saved (verify the sales list did not grow).
5. Try to sell dated before the lots (e.g. 2025-12-01) — same insufficient-quantity message (no lots held on that date).
6. Edit the good sale down to qty 8 → the detail now shows a single allocation line of 8 from the first lot; the lots list's "เหลือ" for the first lot increases accordingly.
7. Delete the sale → both lots show full remaining quantity again.

```bash
git add -A
git commit -m "feat: add sale entry form, sales list, and the signature which-lots sale detail"
```

---

### Task 8: Evidence image attachment

**Files:**
- Create: `src/ui/evidenceName.ts`
- Test: `src/ui/__tests__/evidenceName.test.ts`
- Create: `src/services/evidence.ts`
- Create: `src/ui/components/EvidencePicker.tsx`
- Modify: `src/app/lot/new.tsx`, `src/app/lot/[id]/edit.tsx`, `src/app/lot/[id].tsx`
- Modify: `src/app/sale/new.tsx`, `src/app/sale/[id]/edit.tsx`, `src/app/sale/[id].tsx`

**Interfaces:**
- Consumes: `expo-image-picker`, `expo-file-system`; the form state's `evidenceFile` field; the components.
- Produces:
  - `src/ui/evidenceName.ts` → `function generateEvidenceFilename(source: string): string` — a bare filename (`<hex>.<ext>`, no `/`, `\`, or `:`) that satisfies `ledger.validateEvidenceFile`, preserving the source's (lower-cased) extension, defaulting to `jpg`. Pure, tested.
  - `src/services/evidence.ts` → `evidenceDir(): string`, `resolveEvidenceUri(filename: string): string`, `async pickImageFromGallery(): Promise<string | null>`, `async storeEvidence(sourceUri: string): Promise<string>` (copies into the app document directory's `evidence/` folder, returns the bare filename), `async deleteEvidence(filename: string): Promise<void>`. Native; no automated test.
  - `src/ui/components/EvidencePicker.tsx` → `EvidencePicker({ filename, onChange })` — thumbnail + attach/replace/remove control; `onChange(filename: string | null)` updates the form's `evidenceFile`.

**Why the filename rule matters.** The ledger already throws `InvalidEvidenceFileError` if `evidenceFile` contains a path separator (CLAUDE.md: stored by filename, never an absolute path — an image-picker hands back a `file:///…` URI, which must never be persisted). `generateEvidenceFilename` is what guarantees only a bare basename reaches the ledger.

- [ ] **Step 1: Write the failing filename test**

Create `src/ui/__tests__/evidenceName.test.ts`:

```ts
import { generateEvidenceFilename } from '../evidenceName';

test('preserves and lower-cases the source extension', () => {
  expect(generateEvidenceFilename('IMG_0001.PNG')).toMatch(/\.png$/);
  expect(generateEvidenceFilename('file:///tmp/a/b/photo.JPEG')).toMatch(/\.jpeg$/);
});

test('defaults to jpg when there is no extension', () => {
  expect(generateEvidenceFilename('noextension')).toMatch(/\.jpg$/);
});

test('output is a bare filename with no path separators', () => {
  for (const src of ['file:///a/b/c.jpg', 'C:\\pics\\x.png', 'plain.gif']) {
    const name = generateEvidenceFilename(src);
    expect(name).not.toMatch(/[/\\:]/); // the exact chars ledger.validateEvidenceFile rejects
  }
});

test('successive calls differ', () => {
  expect(generateEvidenceFilename('a.jpg')).not.toBe(generateEvidenceFilename('a.jpg'));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- evidenceName`
Expected: FAIL — cannot find module `../evidenceName`.

- [ ] **Step 3: Implement the filename generator**

Create `src/ui/evidenceName.ts`:

```ts
/**
 * A bare, collision-resistant filename for a picked evidence image.
 * Only hex digits, a dot, and the extension — so it can never contain a
 * path separator, satisfying ledger.validateEvidenceFile (CLAUDE.md:
 * evidence is stored by filename, never an absolute path).
 */
export function generateEvidenceFilename(source: string): string {
  const match = /\.([A-Za-z0-9]+)(?:\?.*)?$/.exec(source.trim());
  const ext = (match?.[1] ?? 'jpg').toLowerCase();
  const rand = (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 16);
  const stamp = Date.now().toString(16);
  return `${stamp}${rand}.${ext}`;
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm test -- evidenceName`
Expected: PASS.

- [ ] **Step 5: Implement the native evidence service**

Create `src/services/evidence.ts`. Uses the stable legacy `expo-file-system` API surface (`documentDirectory`, `getInfoAsync`, `makeDirectoryAsync`, `copyAsync`, `deleteAsync`), imported from `expo-file-system/legacy` so it is unaffected by the new File API in recent SDKs:

```ts
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { generateEvidenceFilename } from '../ui/evidenceName';

export function evidenceDir(): string {
  return `${FileSystem.documentDirectory}evidence/`;
}

export function resolveEvidenceUri(filename: string): string {
  return `${evidenceDir()}${filename}`;
}

/** Opens the gallery (images only) and returns the picked URI, or null if cancelled. */
export async function pickImageFromGallery(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0]!.uri;
}

/** Copies a picked image into the app's evidence folder and returns its bare filename. */
export async function storeEvidence(sourceUri: string): Promise<string> {
  const dir = evidenceDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const filename = generateEvidenceFilename(sourceUri);
  await FileSystem.copyAsync({ from: sourceUri, to: `${dir}${filename}` });
  return filename;
}

export async function deleteEvidence(filename: string): Promise<void> {
  await FileSystem.deleteAsync(resolveEvidenceUri(filename), { idempotent: true });
}
```

If `mediaTypes: ['images']` is rejected by the installed `expo-image-picker` version, use `ImagePicker.MediaTypeOptions.Images` instead — the array form is the current API; the enum is the older one. Gallery-only is a spec requirement (§1: "gallery only" — no camera).

- [ ] **Step 6: Build the EvidencePicker component**

Create `src/ui/components/EvidencePicker.tsx`:

```tsx
import { View, Image, Text, Alert, StyleSheet } from 'react-native';
import { FormField } from './Field';
import { Button } from './Button';
import { pickImageFromGallery, storeEvidence, resolveEvidenceUri } from '../../services/evidence';
import { color, space, radius, font, fontFamily } from '../../theme/tokens';

export function EvidencePicker({ filename, onChange }: { filename: string | null; onChange: (filename: string | null) => void }) {
  async function attach() {
    try {
      const picked = await pickImageFromGallery();
      if (!picked) return;
      const stored = await storeEvidence(picked);
      onChange(stored);
    } catch (e) {
      Alert.alert('แนบรูปไม่สำเร็จ', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <FormField label="หลักฐาน (รูปสลิป)">
      {filename ? (
        <Image source={{ uri: resolveEvidenceUri(filename) }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <Text style={styles.empty}>ยังไม่มีรูปแนบ</Text>
      )}
      <View style={styles.actions}>
        <Button title={filename ? 'เปลี่ยนรูป' : 'แนบรูป'} variant="outline" onPress={attach} />
        {filename ? <Button title="ลบรูป" variant="danger" onPress={() => onChange(null)} /> : null}
      </View>
    </FormField>
  );
}

const styles = StyleSheet.create({
  thumb: { width: '100%', height: 180, borderRadius: radius.md, borderColor: color.cardBorder, borderWidth: 1, marginBottom: space[2] },
  empty: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm, marginBottom: space[2] },
  actions: { flexDirection: 'row', gap: space[2] },
});
```

Note: "ลบรูป" only clears the form's reference; it does not delete the stored file here, so a cancelled edit never orphans an image the lot still points at. Reclaiming truly-unreferenced image files is deferred to the backup/restore plan (plan 6), which rewrites the evidence folder wholesale on restore.

- [ ] **Step 7: Wire EvidencePicker into all four forms**

In each of `lot/new.tsx`, `lot/[id]/edit.tsx`, `sale/new.tsx`, `sale/[id]/edit.tsx`: import `EvidencePicker` and render it just above the save button, bound to the form's `evidenceFile`:

```tsx
import { EvidencePicker } from '../../ui/components/EvidencePicker'; // adjust depth: '../../../' in the [id]/edit screens
// ...
<EvidencePicker
  filename={form.evidenceFile}
  onChange={(evidenceFile) => setForm((f) => (f ? { ...f, evidenceFile } : f))}
/>
```

(For the `new` screens `form` is non-null, so the callback is simply `(evidenceFile) => setForm((f) => ({ ...f, evidenceFile }))`.) The `evidenceFile` then flows through `validateLotForm`/`validateSaleForm` unchanged (they pass it through) into `addLot`/`editLot`/`addSale`/`editSale`, which call `validateEvidenceFile` — a bare filename passes.

- [ ] **Step 8: Show the evidence thumbnail on the detail screens**

In `lot/[id].tsx` and `sale/[id].tsx`, when the record's `evidenceFile` is set, render its image below the detail card:

```tsx
import { Image } from 'react-native';
import { resolveEvidenceUri } from '../../services/evidence';
// ...inside the returned JSX, after the main Card:
{lot.evidenceFile ? (
  <Image
    source={{ uri: resolveEvidenceUri(lot.evidenceFile) }}
    style={{ width: '100%', height: 220, borderRadius: 8, marginTop: 16 }}
    resizeMode="contain"
  />
) : null}
```

(Use `sale.evidenceFile` in the sale screen.)

- [ ] **Step 9: Typecheck, test, and full end-to-end manual verification**

Run: `npm run typecheck` → passes.
Run: `npm test` → green (evidenceName test added; all prior tests still pass). This is the final state of the suite for this plan.

Manual verification (`npx expo start`, on a **physical device or emulator with a gallery** — evidence needs real gallery access):
1. Cold start the app: it opens to the ภาพรวม placeholder; the DB is created.
2. ซื้อ → add a lot; in the form tap แนบรูป, grant the media permission, pick an image — a thumbnail appears; save.
3. Open the lot detail — the evidence image renders below the card.
4. Edit the lot → เปลี่ยนรูป with a different image → save → detail shows the new image. Edit again → ลบรูป → save → detail shows no image.
5. Repeat attach on a sale; confirm the thumbnail shows on the signature sale detail too.
6. Full FIFO flow once more end to end (add two lots, sell across both, inspect the allocation lines, edit, delete) confirming every list re-renders immediately after each mutation (the `dataVersion` reload wiring).
7. Confirm no redbox on a cold start, a Fast Refresh, and tab switches.

```bash
git add -A
git commit -m "feat: attach gallery evidence images to lots and sales, shown on detail screens"
```

---

## Plan Self-Review

**1. Spec coverage (§7 and related):**
- §7 structure (`core/db/services/report/app`) — extended with `src/ui/` and `src/theme/` for the UI layer (a deliberate, documented addition; `report/` is plan 5). ✓
- §7.1 screens: `(tabs)` dashboard/lots/sales/more ✓ (dashboard placeholder — plan 4 per roadmap); `symbols/` ✓ (Task 5); `lot/[id]` ✓ (Task 6); `sale/[id]` signature screen ✓ (Task 7). `(lock)/` PIN gate — **deferred to plan 7** (the PIN lock), noted below.
- §7.2 mobile UI: forms are full screens, not modals ✓; `keyboardType="decimal-pad"` with `,` stripped ✓ (`DecimalInput`); native date pickers ✓ (`DateField`); one `zustand` store owns reload ✓ (Task 2).
- §7.4 symbol management: searchable combo with inline add ✓; advisory/offline creation ✓ (no network in this plan); uppercase+trim normalization via `repo` ✓; Symbols screen with usage counts, rename, delete-if-unused ✓.
- §2.4 allocations derived: every mutation goes through the ledger (which rebuilds) — the UI never writes an allocation ✓.
- §3.2 sale-date holding check: surfaced as the insufficient-quantity message, not re-implemented ✓.
- §10 testing: logic modules unit-tested under Node; screens manually verified ✓.

**2. Placeholder scan:** No "TBD"/"handle errors"/"similar to Task N". Every code step carries real code; every manual step says what to do and what to observe. The dashboard is an intentional placeholder (roadmap boundary), labelled as such, not an unfinished step.

**3. Type consistency:** `NewLotInput`/`NewSaleInput` field names match `services/ledger.ts` exactly (`symbolId`, `buyDate`/`sellDate`, `priceUsd`, `qty`/`qtySold`, `salePriceUsd`, `feeUsd`, `fxRateUsdThb`, `evidenceFile`). `LotFormState`/`SaleFormState` mirror them plus the `ticker` query handled by the screen, not the form model. `filterSymbols`, `listSymbolsWithCounts`, `buildSaleDetail`, `generateEvidenceFilename`, `validateLotForm`, `validateSaleForm` signatures are used consistently across their definition task and consumer screens. `toDomainLot`/`toDomainSale`/`lotQtyRemaining`/`lotCostThb`/`saleProceedsThb`/`saleCostBasisThb`/`saleCapitalGainThb` are consumed with the signatures confirmed in `src/services/ledger.ts` and `src/core/derive.ts`.

**Deferred to later plans (recorded so executors don't treat them as gaps):**
- The `(lock)/` PIN gate and `FLAG_SECURE` (spec §6) — plan 7.
- Live dashboard content: portfolio value, unrealized gain, allocation chart (spec §7.1, §5) — plan 4; the tab is a placeholder now.
- Quote/FX fetching and the "unverified symbol, backfill name later" flow (spec §5, §7.4) — plan 4.
- Backup/restore, PDF/CSV report, the "More" hub's disabled rows (spec §4, §7.3, §8) — plans 5–6.
- Reclaiming orphaned evidence files — plan 6 (restore rewrites the evidence folder wholesale).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-13-mobile-app-shell-transaction-ui.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, task review after each, broad review at the end. Same as plans 1–2.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
