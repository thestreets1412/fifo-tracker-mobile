# Reference Material

Read-only source material carried over from the Django web app that this project's
design was derived from. **Nothing here is part of the build.** It is not imported, not
executed, not tested, and not deployed. It exists so that a port can be checked against
the original rather than reinvented from memory.

The original lives at `D:\Python\stock-fifo-web-app` and continues to run independently on
a Raspberry Pi. The two projects share no code and no data. This snapshot was taken on
2026-09-12; the original may have moved on since.

## `django/`

| File | Why it is here |
|---|---|
| `models.py` | Origin of the four-table schema. Field types and decimal places in `docs/superpowers/specs/` come from here. |
| `services.py` | Origin of the FIFO algorithm. `record_sale()` is what `src/core/fifo.ts` ports. Also holds the FX and live-price fetching that plan 4 replaces. |
| `reports.py` | The ReportLab PDF and CSV layout that plan 5 re-expresses as HTML. Column headers, ordering, and gain/loss coloring should match. |
| `forms.py` | Validation rules and the blank-FX-rate auto-fetch behavior. |
| `tests.py` | 568 lines encoding expected behavior. The most valuable file here — read it before porting anything, since it states what the original is supposed to do rather than what it happens to do. |

### Known divergences from the original

The port deliberately does not reproduce everything. Recorded here so a future reader does
not "fix" the port back toward the original:

- **`record_sale()` never checks that a lot was bought before the sale.** It filters by
  owner and symbol only, so a sale dated before a lot's `buy_date` can still draw from it.
  The mobile engine rejects this. See spec section 3.2.
- **Allocations are immutable history in the original, derived data here.** The original
  relies on Django admin for corrections; mobile has no admin, so lots and sales are
  editable and allocations are rebuilt. See spec section 2.4.
- **`owner` scoping does not carry over.** There is one user and no login.
- **Ordering gains `id` as a final tiebreaker**, because restoring a backup can produce
  identical `created_at` values where `auto_now_add` never did.

## `tokens/`

The three CSS custom-property files from `portfolio/static/portfolio/tokens/` — the
"Quantum Neon" palette, type scale, and spacing scale. These are the values the React
Native theme should be built from, so the mobile app looks like a sibling of the web app
rather than an unrelated product.

CSS custom properties do not exist in React Native. The values transfer; the mechanism
does not.

## Related

`.claude/skills/fifo-stock-tracker-design-system/` holds the fuller component library the
same theme was expressed in — JSX components, token files, and guideline cards. It is
wired up as a project skill, so it can be consulted directly when building screens in
plan 3.
