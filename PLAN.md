# data-redacted — Build Plan

**Browser-only spreadsheet redaction.** Drop in an Excel file, pick the columns that hold
sensitive data, choose how each one gets redacted, download a clean copy. The file never
leaves the tab — and that claim is enforced by the build, not just promised in a README.

- **Repo:** `hafidznoor/data-redacted` (public, MIT)
- **URL:** `https://hafidznoor.github.io/data-redacted/`
- **Status:** planning complete, all decisions resolved. Ready to scaffold.

---

## 1. Decisions locked

| Area | Decision |
|---|---|
| Framework | Vite + React 19 + TypeScript |
| Styling | Tailwind v4 (CSS-first config, no `tailwind.config.js`) |
| UI | shadcn/ui base + rare-ui for personality |
| Entry | Straight into the tool — no separate landing page |
| Input | `.xlsx` (other formats later) |
| Output | Data-only `.xlsx`, plus CSV option |
| Sheets | User picks which to redact; user also picks export scope |
| Header row | Auto-detected, user-overridable |
| Redact modes | Blank/mask, partial/format-preserving, deterministic hash, synthetic fake |
| Default mode | Detection's suggestion, else deterministic hash |
| Fake data | Indonesian + English, user-switchable |
| Detection | Auto-suggest from header names **and** value sampling |
| Scale | Up to ~50MB / ~500k rows, Web Worker + virtualized preview |
| Privacy | Maximum — strict CSP, zero third-party, offline-capable |
| Excel lib | SheetJS, pinned to the vendor tarball |
| Also in v1 | Audit summary, EN/ID interface, MIT + contributor docs |
| Not in v1 | Saved redaction profiles |

---

## 2. Architecture

```
index.html  ← meta CSP lives here
  └── React app (main thread)
        └── Tool  (first and only screen)
              ├── Dropzone      → hands File to worker, never reads it on main thread
              ├── Sheet picker  → which sheets to redact + export scope
              ├── Header row    → auto-detected, confirmable
              ├── Column mapper → per-column mode + options
              ├── Preview       → virtualized, worker-sampled rows only
              └── Export        → Blob → object URL → <a download>
                    │
                    ▼
              redaction.worker.ts   (all file bytes live here)
                    ├── SheetJS read
                    ├── sheet + header-row profiling
                    ├── column detection scores
                    ├── apply transforms per column
                    └── SheetJS/CSV write → Blob back to main thread
```

**Rule: raw cell data never touches React state.** The worker owns the parsed workbook. The
main thread only ever holds column metadata, detection scores, a small preview sample, and
the final Blob. This keeps 500k rows out of the render tree and shrinks the surface where
data could accidentally be logged or persisted.

---

## 3. Redaction engine

Four modes, each a pure `(value, options, ctx) => value` function. Pure functions are
independently unit-testable and are the part of this project most worth getting right.

### 3.1 Blank / fixed mask
Replace every value with `""` or a constant (`***REDACTED***`). Irreversible, no config.
Best for free-text columns like notes or addresses where structure has no value.

### 3.2 Partial / format-preserving
Keep the shape, drop the content. Per-type rules:

| Type | Input | Output |
|---|---|---|
| Email | `budi.santoso@doku.com` | `b***@doku.com` |
| Phone | `+628123456789` | `+6281****6789` |
| Card | `4111111111111111` | `411111******1111` |
| NIK | `3175012501900001` | `3175**********01` |
| Date | `1990-01-25` | `1990-**-**` |
| Generic | `Budi Santoso` | `B*** S***` |

Configurable: how many leading/trailing chars survive. Default to the conservative end —
it is easier for a user to reveal more than to discover they leaked more than they meant to.

### 3.3 Deterministic hash / pseudonym
Same input → same output, so joins, counts and group-bys still work downstream. **This is
also the fallback default mode** (see §5.3).

- **Hash:** SHA-256 via `crypto.subtle`, truncated to a configurable length.
- **Salt:** random per session by default, so outputs are *not* comparable across runs and a
  rainbow-table attack on a low-entropy column (phone numbers, NIK) fails.
- **Opt-in fixed salt:** user can supply one when they *need* cross-file joins. The UI must
  state plainly that a fixed salt makes low-cardinality columns reversible by brute force.
- **Sequential alias:** `USER_0001`, `USER_0002` — mapping held in worker memory, discarded
  on completion. Most readable option when cross-file joins don't matter.

> **Low-cardinality warning.** Hashing does not hide a column with few distinct values — if
> `gender` has two hashes in a 9:1 split, both are trivially identified by frequency. We
> already know each column's distinct count from detection sampling, so the UI should flag
> this and suggest blank instead when cardinality is below a threshold.

### 3.4 Synthetic fake
Replace with realistic values of the same type, locale-aware.

| Type | id_ID | en |
|---|---|---|
| Name | Budi Santoso | John Smith |
| Address | Jl. Sudirman No. 45, Jakarta Selatan | 123 Main St, Springfield |
| Phone | +62 812-3456-7890 | +1 555-0142 |
| Email | budi.santoso@example.com | john.smith@example.com |
| NIK | 16-digit, structurally valid, fictional region | — |
| NPWP | 16-digit, structurally valid | — |

Hand-rolled word lists rather than pulling in Faker — we need two narrow locales, not a
general-purpose generator, and the bundle stays small and auditable. Keep the lists in
`src/lib/fake/` as plain data files so contributors can extend them without touching logic.

Optionally make fake values **consistent** (same input → same fake person) by seeding the
picker with the hashed value. Reuses the 3.3 machinery.

---

## 4. Workbook handling

### 4.1 Sheet selection
List every sheet with its row and column count. User ticks which ones to redact.

**Export scope is a separate, explicit choice:**

- **Only the sheets I picked** *(default)* — unpicked sheets are dropped from the output.
  Nothing unreviewed can ride along.
- **Whole workbook, unpicked sheets unchanged** — preserves the file as the user knew it.

The second option is the one that burns people: a sheet nobody reviewed ships unredacted
inside a file everyone will treat as safe. It needs more than a checkbox label —

- a persistent inline warning **naming the sheets** that will ship unreviewed,
- the same names restated on the export confirmation,
- and the sheet count carried into the audit summary (§ Phase 5).

Default stays on the safe option. Passing data through should be a decision the user
actively makes and can recall making.

### 4.2 Header row detection
Real exports carry title rows, logos and blank spacers above the actual headers, so row 1
is a bad assumption.

Scan the first ~10 rows and score each on:

- cells mostly non-empty,
- values mostly strings (not numbers or dates),
- values unique within the row,
- type divergence from the row beneath it — the strongest signal, since a header row of
  strings sitting above a row of numbers is the classic shape.

Show the detected row with its contents so the choice is visible, not silent. If scoring is
inconclusive, fall back to a row picker rather than guessing. Individual blank header cells
get an editable placeholder (`Column D`) so those columns stay selectable and labelable.

---

## 5. Column detection

### 5.1 Two signals
**Header lexicon** — bilingual, since real Indonesian sheets mix languages freely:
`nik`, `ktp`, `nama`, `alamat`, `telepon`, `hp`, `no_hp`, `email`, `npwp`, `rekening`,
`gaji`, `tgl_lahir`, `name`, `address`, `phone`, `salary`, `dob`, `ssn`, `card`.

**Value sampling** — read ~200 non-empty cells from each column and test:

- **Email** — RFC-ish regex
- **Phone** — E.164 and Indonesian local forms (`08xx`, `+62`)
- **NIK** — 16 digits, and the embedded `DDMMYY` must parse as a real date (day `+40` for
  women). The date check is what separates a real NIK from any 16-digit number.
- **NPWP** — 15 or 16 digits
- **Card** — Luhn checksum
- **Date** — Excel serial numbers *and* common string formats
- **Currency/salary** — numeric with a header hint

The same pass records each column's **distinct-value count**, which feeds the
low-cardinality warning in §3.3.

### 5.2 Scoring
Columns scoring above threshold get pre-checked with a suggested mode. **Every suggestion is
overridable, and nothing is redacted without an explicit click.** Show the score so the user
can calibrate their trust in it.

> Detection is a convenience, not a guarantee. The UI must never imply the tool found
> everything sensitive — say plainly that the user is responsible for the final selection.

### 5.3 Default mode
1. **Detection's suggestion wins** where there is one — email → partial, NIK → hash,
   name → fake, free text → blank.
2. **Otherwise: deterministic hash.** It's the default that destroys the least — row counts,
   joins and group-bys all survive — while still removing the original value. Blank is the
   only strictly safer option, and it silently breaks downstream analysis, which users
   discover too late to fix.
3. Where hash is a poor fit — a low-cardinality column — surface the §3.3 warning rather
   than quietly applying it.

---

## 6. Privacy architecture

This is the product's core claim, so it gets enforced rather than asserted.

### 6.1 What ships
- No analytics, no telemetry, no error reporting, no CDN fonts, no third-party scripts.
- All assets self-hosted and fingerprinted.
- A service worker precaches the app so it runs with the network physically disconnected —
  the most convincing demonstration available: cut your wifi, the tool still works.
- No `localStorage`/`IndexedDB` writes of cell data. Interface language preference only.

### 6.2 CSP — with an honest caveat

**GitHub Pages cannot set HTTP response headers.** CSP therefore has to go in a
`<meta http-equiv="Content-Security-Policy">` tag, which is real but weaker: directives like
`frame-ancestors` and `report-uri` are **ignored** in meta form. Worth knowing up front
rather than discovering during a security review.

```
default-src 'self';
script-src  'self';
style-src   'self' 'unsafe-inline';
img-src     'self' data: blob:;
font-src    'self';
connect-src 'self';
worker-src  'self' blob:;
object-src  'none';
base-uri    'none';
form-action 'none';
```

Two directives are compromises, both deliberate:

- **`style-src 'unsafe-inline'` is unavoidable.** Motion — the animation library every
  rare-ui component depends on — writes inline `style` attributes on every frame. Dropping
  it means dropping rare-ui. The risk it carries (CSS-based exfiltration) is contained by
  `img-src` and `connect-src` being locked to `'self'`.
- **`connect-src 'self'`, not `'none'`.** `'none'` would block the service worker's own
  precaching. `'self'` on GitHub Pages means a static host with no write endpoint, so there
  is still no third party to exfiltrate to and no API to POST into.

### 6.3 Making it verifiable
- `PRIVACY.md` explaining the design in plain language, in both languages.
- A short "verify this yourself" section: open DevTools → Network, redact a file, observe
  zero requests. Or disconnect entirely and watch it still work.
- CI check that fails the build if a diff introduces a network call, an analytics snippet,
  or a remote asset URL. Guards against a well-meaning future PR quietly breaking the
  central promise.

---

## 7. UI composition

### 7.1 No landing page
The dropzone **is** the entry screen — `folder-component` as the centerpiece, nothing to
scroll past. The privacy claim still has to land immediately, without a pitch page to carry
it, so it lives in two always-visible places:

- one plain line under the dropzone — *your file never leaves this tab*,
- a persistent header badge (*offline-capable · nothing uploaded*) linking to `PRIVACY.md`.

Knock-on: `fluid-orb` loses its hero slot. Either drop it, or run it as a quiet ambient
background behind the empty dropzone. **`matrix-orb` is the better pick for the processing
state** — it animates through idle / listening / thinking, which maps onto exactly the
parse → detect → redact cycle.

### 7.2 Flow
`step-player` drives a five-step wizard:

**Drop → Sheets → Header row → Columns → Preview & Export**

Steps collapse when unambiguous — a single-sheet workbook with a confidently detected header
row skips straight to Columns, with both decisions shown as editable summaries rather than
hidden.

### 7.3 Component map

| Surface | Component | Source |
|---|---|---|
| Upload zone | `folder-component` | rare-ui |
| Wizard progress | `step-player` | rare-ui |
| Processing state | `matrix-orb` | rare-ui |
| Redact confirm | `delete-button` | rare-ui |
| Row/cell counts | `animated-counter` | rare-ui |
| Sheet + column tables | `table`, `checkbox` | shadcn |
| Mode pickers | `select`, `radio-group` | shadcn |
| Header row picker | `select`, `input` | shadcn |
| Options, help | `dialog`, `tooltip`, `tabs` | shadcn |
| Warnings | `alert`, `badge` | shadcn |

Both install through the same CLI into the same `@/components/ui` directory and share the
same `cn` helper, so they compose without glue:

```bash
npx shadcn@latest add button table checkbox select dialog alert
npx shadcn@latest add swamimalode07/rare-ui/folder-component
```

Preview table is virtualized (`@tanstack/react-virtual`) and renders a worker-supplied
window of rows — never the full sheet.

---

## 8. Verified findings and risks

Checked against the live repo while writing this plan:

- ✅ **Tailwind v4 confirmed, and it matches.** rare-ui ships `tailwindcss: ^4` with
  `@tailwindcss/postcss`, and its `globals.css` opens with `@import "tailwindcss"` plus
  `@custom-variant dark (&:is(.dark *))` and oklch color tokens. No `tailwind.config.js`
  anywhere — v4 config is CSS-first via `@theme`. Use `@tailwindcss/vite` (not the PostCSS
  plugin) in a Vite project. Their `:root` token block can be lifted directly for a matching
  look, and shadcn's v4 init produces the same token shape.
- ✅ **React 19.** rare-ui is on `react@19.2.4` and `motion@^12.40`. Match those — React 19
  is what its components were written against.
- ✅ **Most rare-ui components are Vite-safe.** `folder-component`, `delete-button`,
  `animated-counter`, `step-player`, `matrix-orb` and `fluid-orb` import only `react`,
  `motion/react` and `@/lib/utils`. Their `"use client"` directive is a harmless no-op
  outside Next.js — the bundler may warn about an ignored directive; that's cosmetic.
- ⚠️ **`gooey-nav` will not build under Vite.** It imports `next/link` and `usePathname`
  from `next/navigation`. Not needed now that there's no landing page — skip it.
- ⚠️ **`step-player` pulls in `flubber`** (SVG path interpolation) — an extra dependency for
  one component. Fine, but know it's there before committing to the wizard.
- ⚠️ **SheetJS sourcing needs explaining to contributors.** The npm `xlsx` package is
  abandoned at `0.18.5` (Apache-2.0) with known CVEs. Current releases ship only from the
  vendor CDN. Pin it explicitly:
  ```json
  "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  ```
  Verified reachable (~2.4MB). This is a **build-time** fetch — runtime stays zero-network.
  Document it in `CONTRIBUTING.md` so nobody "helpfully" swaps it back to the npm version.
- ⚠️ **Pass-through sheets are the sharpest edge in the product.** §4.1 mitigations are not
  optional polish — they're the difference between a useful option and a data leak.
- ⚠️ **Browser memory is the real ceiling**, not our code. A 50MB xlsx can expand several-fold
  once parsed. Add a size check with a clear warning, and fail with an honest message rather
  than a frozen tab.
- ⚠️ **Formulas, comments, defined names and hidden sheets can leak.** Handled by construction
  for redacted sheets — we read values and write a fresh workbook. **Not** handled for
  pass-through sheets, which keep whatever they carried. Test both paths explicitly.

---

## 9. Phases

### Phase 0 — Scaffold and prove deployment
`git init`, Vite + React 19 + TS, Tailwind v4 via `@tailwindcss/vite`, shadcn init (v4 mode),
path aliases, `base: '/data-redacted/'`, MIT LICENSE, GitHub Actions deploy workflow.
**Ship a placeholder page and confirm the live URL loads before writing any features.**
GitHub Pages base-path problems are the single biggest time sink in this kind of project;
find them on day one, not at launch.

### Phase 1 — Engine, headless and tested
Worker harness, SheetJS read, the four transforms as pure functions, xlsx + CSV writers,
both export scopes. Vitest coverage on transforms and edge cases: empty cells, mixed types,
unicode names, Excel date serials, very long strings, and a pass-through sheet surviving
untouched. No UI yet — the engine is the product.

### Phase 2 — Detection
Bilingual header lexicon, value sampling, validators (NIK date check, Luhn, E.164),
cardinality counting, scoring, mode suggestion, header-row detection. Test against
deliberately messy fixtures: title rows above headers, blank header cells, mixed formats,
`col_7`-style anonymous columns.

### Phase 3 — Interface
shadcn base install, rare-ui pulls, the five-step wizard with collapsing steps, virtualized
table, progress and cancel, and the §4.1 pass-through warnings. First point where it feels
like a product.

### Phase 4 — Privacy hardening
Meta CSP, self-hosted fonts, service worker, `PRIVACY.md`, and the CI guard against network
calls. Verify by running the whole flow with the network disconnected.

### Phase 5 — i18n, audit, open-source polish
EN/ID interface strings, audit summary (sheets redacted, sheets passed through, columns,
modes, cell counts, before/after file hashes) with download, `CONTRIBUTING.md`, issue
templates, README with screenshots.

---

## 10. Repo layout

```
data-redacted/
├── .github/workflows/deploy.yml
├── public/                     # favicon, self-hosted fonts, 404.html
├── src/
│   ├── components/
│   │   ├── ui/                 # shadcn + rare-ui land here together
│   │   └── tool/               # Dropzone, SheetPicker, HeaderRow, ColumnMapper, Preview, Export
│   ├── lib/
│   │   ├── redact/             # the four transforms + registry
│   │   ├── detect/             # lexicon, validators, scoring, header-row
│   │   ├── fake/               # id_ID + en word lists
│   │   ├── excel/              # SheetJS read/write wrappers
│   │   └── utils.ts            # cn
│   ├── workers/redaction.worker.ts
│   ├── i18n/                   # en.json, id.json
│   ├── index.css               # Tailwind v4 @theme tokens
│   └── App.tsx
├── LICENSE  ·  PRIVACY.md  ·  CONTRIBUTING.md  ·  README.md
└── vite.config.ts
```

---

## 11. Resolved

All Section 10 questions from the first draft are closed:

| Question | Resolution |
|---|---|
| Tailwind v3 or v4 | **v4** — confirmed to match rare-ui exactly |
| Landing page first? | **No** — straight into the tool |
| Multi-sheet handling | **User picks** sheets, and picks the export scope |
| Header row | **Auto-detect**, user sets it when detection is inconclusive |
| Default mode | **Hash**, unless detection suggests something better |

Nothing is blocking Phase 0.
