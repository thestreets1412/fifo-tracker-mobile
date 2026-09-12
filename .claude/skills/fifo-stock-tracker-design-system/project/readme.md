# FIFO Stock Tracker — Design System

## Sources

This design system is derived entirely from one codebase:

- **GitHub:** [thestreets1412/stock-fifo-django](https://github.com/thestreets1412/stock-fifo-django)

Explore that repository further for the full picture — models (`portfolio/models.py`), FIFO allocation logic (`portfolio/services.py`), PDF/CSV report generation (`portfolio/reports.py`), and the Django templates (`portfolio/templates/portfolio/`) that this system's tokens and components were read from.

No Figma file, slide deck, or additional brand asset was provided. If you have one, attach it and this system can be extended.

## Product context

**Stock FIFO Tracker** is a personal-use Django web app for tracking stock trades with First-In-First-Out (FIFO) cost-basis accounting, in dual-currency (USD/THB). It has one surface: a small internal tool, not a public-facing product.

- **Users record buys** as immutable "lots" (ticker, date, USD price, quantity, USD→THB FX rate, optional evidence photo).
- **Users record sells**, and the app automatically walks open lots oldest-first, allocating the sale across as many lots as needed, computing realized capital gain in THB.
- **Two list views** — Stock Lots (open positions) and Sell History (realized sales, with per-sale FIFO lot breakdown).
- **A FIFO Portfolio Report** exports as PDF (formal, one page per ticker, ReportLab) or CSV (flat ledger).
- Built on **Django 6 + Bootstrap 5** (via CDN) — no design tooling, no custom component library, no logo.

There is exactly one product/surface here (no separate marketing site, mobile app, etc.), so this system contains one UI kit.

## Components

Core: `Button`, `Card` / `CardBody` / `CardTitle`, `Table` / `TableRow` / `TableCell`.
Forms: `FormField`, `TextInput`, `Select`, `FileInput`.
Feedback: `Alert`, `GainLossBadge`.
Navigation: `Navbar`, `Modal`, `Dropdown`.

These are not an invented "standard component set" — they are exactly the Bootstrap-based primitives the source templates use (navbar, striped/hover tables, bordered cards, Bootstrap modals, dropdown menus, dismissible alerts, standard form controls) plus one custom piece: `GainLossBadge`, which formalizes the green/red capital-gain text pattern from `sale_list.html` and the PDF report's `GAIN_COLOR`/`LOSS_COLOR`.

### Intentional additions
- **`GainLossBadge`** — the source repeats "green if ≥0, red if negative" inline in two places (template + PDF generator) without a named component; promoted here so it's used consistently everywhere a capital gain/loss number appears.

No Checkbox/Radio/Switch/Tabs/Toast/Tooltip/Badge exist — the source app never uses them, so they were not invented.

## Index

- `styles.css` — root stylesheet, imports all tokens.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`.
- `components/core/` — Button, Card, Table.
- `components/forms/` — FormField, TextInput, Select, FileInput.
- `components/feedback/` — Alert, GainLossBadge.
- `components/navigation/` — Navbar, Modal, Dropdown.
- `guidelines/` — foundation specimen cards (colors, type, spacing, brand/iconography).
- `ui_kits/fifo-tracker/` — `App.jsx` + `index.html`, an interactive recreation of the Lots / Sell History screens with working Record Buy / Record Sell modals and live FIFO allocation.
- `SKILL.md` — Claude Code–compatible skill file for using this system outside this environment.

## Content fundamentals

The app has almost no marketing copy — it's a utility tool, and its "voice" is entirely in labels, button text, and error messages.

- **Voice:** imperative and terse. Buttons say what they do: "Record Buy", "Record Sell", "Sell (FIFO)", "Save", "View", "Download CSV", "Download PDF". No "Get Started", no marketing verbs.
- **Address:** second person only in the navbar greeting — "Hi, {{ user.username }}" — otherwise content is impersonal (field labels, table headers). No first-person ("I"/"we") anywhere.
- **Casing:** Title Case for headings and button labels ("Stock Lots", "Sell History", "Record a Buy"); sentence case for form labels and help text; ALL CAPS never used except CSV section markers (`=== TICKER: NVDA ===`) which are a machine-readable convention, not a voice choice.
- **Errors are literal, not soft:** the one hand-written user-facing error string is *"Cannot sell more shares than you hold"* (paraphrased from `InsufficientLotsError`) — direct cause-and-effect, no apology, no hedging.
- **Numbers over prose:** the report and tables prefer a number with a precise unit ("Cost (THB)", "FX Rate", "Qty Remaining") over descriptive text. Financial precision (THB monetary values quantized to 2dp, share quantities to 8dp) matters more than tone.
- **No emoji, no exclamation points, no humor.** This is a ledger, and it reads like one.

## Visual foundations

**Theme: "Quantum Neon"** — a dark glassmorphism reskin adopted from a Canva-generated
mockup (`.canvas_generated_theme_html_template/HomePageStockAndSaleLists_QuantumNeonTheme.html`
+ `ModalCard_QuantumNeonTheme.html`). Bootstrap 5 remains the only markup/JS dependency —
this is a CSS override layer against Bootstrap's own class names (`.form-control`,
`.btn-primary`, `.modal-content`, etc.), not a framework swap.

- **Colors:** dark navy `#0A0E1A` background throughout. Cyan `#00F0FF` is the one primary action/brand color per screen (was Bootstrap blue `#0d6efd`). The bespoke gain/loss pair is now lime `#39FF14` (gain) / red `#FF3B30` (loss), with magenta `#FF2E93` as a secondary accent (danger/report-header). Read as: **functional, not expressive** — color still exists to mark state (success/danger/gain/loss), it just glows now.
- **Type:** display/body font is **Space Grotesk**, data/labels/mono figures use **IBM Plex Mono** (both via Google Fonts) — replacing the old OS system-font stack. Same weight range (400/500/600/700), same size scale (Bootstrap's default h1–h6 + body + small).
- **Spacing:** unchanged — Bootstrap's 0.25rem-step spacer scale via the same utility classes (`mb-3`, `mb-4`, `py-3`, `gap-2`).
- **Backgrounds:** dark navy page background with a faint cyan grid overlay and soft cyan/magenta glow radials (`body::before`/`::after` in the mockup) instead of flat white. No illustrations/photo imagery in the chrome.
- **Animation:** unchanged — Bootstrap's built-in modal fade and alert `fade show` transitions. No custom easing/bounce added.
- **Hover / press states:** buttons and cards now lift and glow on hover (cyan box-shadow) instead of darkening a shade; table rows get a cyan-tinted hover instead of Bootstrap's gray `table-hover` tint.
- **Borders & shadows:** translucent cyan borders (`rgba(0,240,255,.17)`) instead of solid gray, on cards/inputs/tables. Cards now carry a soft glow shadow instead of being flat.
- **Corner radii:** unchanged — 0.375rem buttons/inputs/dropdowns, 0.5rem cards/modals.
- **Transparency / blur:** glassmorphism — cards, navbar, modal, and footer are translucent (`rgba(255,255,255,.05)`-ish) with `backdrop-filter: blur(...)`, not flat opaque surfaces. Modal backdrop is darker + blurred, not Bootstrap's flat `rgba(0,0,0,.5)`.
- **Imagery:** unchanged — user-uploaded "evidence" images are the only imagery, shown plainly in a (now glass) card with `img-fluid`.
- **Layout:** unchanged — top navbar + centered `container` + footer, no sidebars/off-canvas nav.
- **Density:** unchanged — table-first, data-dense ledger UI.

**Known limitation:** the design-system components in this kit (`Button.jsx`, `Navbar.jsx`,
etc.) set some colors as literal hex rather than tokens (e.g. `Alert.jsx`'s tone palette,
`Button.jsx`'s primary `fg: "var(--white)"` which reads light text on a now-light-cyan
button instead of dark ink). The real app's `portfolio/static/portfolio/style.css` overrides
these correctly for the actual Bootstrap markup; if this kit's React components are ever
used for real, revisit those hardcoded spots.

## Iconography

- The source app itself defines **no icon system** — the only `<svg class="bi">` markup in `base.html` (`#bootstrap`, `#instagram`, `#facebook` sprite refs) is leftover boilerplate from Bootstrap's own starter template footer, not real, wired-up icons (no `<symbol>` defs exist anywhere in the repo, so those `<use>` tags render blank in practice).
- No emoji, no unicode glyphs used as icons, no PNG icon assets exist in the codebase.
- **Substitution:** this system links **Bootstrap Icons** from CDN (`bootstrap-icons@1.11.3`) as the closest-fitting set — same design language as the Bootstrap 5 CSS the app already depends on, same stroke/fill weight. See the "Iconography" card in the Brand group for the substitute glyphs mapped to this app's concepts (cash/lot, gain graph, receipt/evidence, PDF/CSV export, logout).
- If real product icons exist outside this repo, replace the CDN link with real assets and update this section.

## Caveats

- No logo or brand mark exists anywhere in the source — wordmark is rendered as plain semibold text, matching `.navbar-brand`. Do not invent a logo for this brand.
- Custom webfonts (Space Grotesk + IBM Plex Mono) are now loaded via Google Fonts, per the Quantum Neon reskin — this replaces the earlier "OS system-font, no webfont" decision.
- Iconography is a substitution — see ICONOGRAPHY below. Bootstrap Icons stay as the icon set; the reskin doesn't switch to Lucide even though the source canvas mockup used it.
