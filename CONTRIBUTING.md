# Contributing

Thanks for taking a look. Two things below are unusual enough that you should
read them before your first pull request.

## 1. Do not "fix" the SheetJS dependency

`package.json` pins the Excel parser to a tarball URL:

```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

This looks wrong and is not. The `xlsx` package on npm was abandoned at `0.18.5`
and carries known CVEs; SheetJS ships current releases only from their own CDN.
Pointing this back at the npm registry downgrades the parser and reintroduces
those vulnerabilities.

This is a **build-time** fetch by your package manager. It does not put a network
call in the shipped app.

## 2. Do not disable the privacy guard

`scripts/check-no-network.mjs` runs in CI and fails the build if anything in
`src/` gains the ability to talk to the network — `fetch`, `XMLHttpRequest`,
`sendBeacon`, WebSocket, a remote URL, a Google Font, or a known analytics
package.

This is the entire product. A pull request that adds error reporting, a font CDN,
usage analytics or a "quick" API call will be declined no matter how useful the
feature is.

If the guard flags something that is genuinely safe — a URL that only ever
appears in human-readable copy, never in a request — add a `privacy-guard-ok`
comment on that line and say why in the PR.

```bash
node scripts/check-no-network.mjs
```

## Getting set up

```bash
npm install
npm run dev
```

Before pushing:

```bash
npm run typecheck
npm test
node scripts/check-no-network.mjs
```

## Where things live

```
src/lib/redact/    the four transforms — pure functions, heavily tested
src/lib/detect/    header lexicon, value validators, column scoring
src/lib/fake/      Indonesian and English word lists
src/lib/excel/     SheetJS read/write wrappers
src/workers/       the worker that owns all file bytes
src/components/    shadcn/ui and rare-ui primitives, plus the tool itself
```

**The architectural rule: raw cell data never reaches React state.** The worker
owns the parsed workbook; the main thread gets metadata, scores, a preview sample
and the finished blob. Keep it that way — it is what keeps 500k rows out of the
render tree, and it narrows where data could be logged by accident.

## Adding a redaction mode

1. Write it as a pure function in `src/lib/redact/`.
2. If it needs async or per-distinct-value work, resolve it in `buildLookup`
   rather than per cell — the row pass must stay synchronous.
3. Add it to the `RedactMode` union and `MODE_FOR_TYPE`.
4. Test it, including empty cells, unicode, and very long values.
5. Add labels to **both** `src/i18n/en.json` and `src/i18n/id.json`.

## Adding a detector

New formats are welcome, especially non-Indonesian ones.

1. Add a validator to `src/lib/detect/validators.ts`. **Be strict.** A false
   positive silently redacts a column someone needed, which is worse than a miss
   they can see and correct.
2. If the test is permissive — matching any number, say — mark it
   `requiresHeader: true` so it only fires when the header agrees.
3. Add header keywords in both languages to `src/lib/detect/lexicon.ts`.
4. Test the near-misses, not just the matches. The NIK validator earns its keep
   by *rejecting* 16-digit order numbers.

## Translations

`src/i18n/en.json` and `src/i18n/id.json` must have identical key sets. A new
language means a new file plus an entry in `LANGUAGES` — and bundling it, not
fetching it.

## Style

Match the surrounding code. Comments explain *why*, not *what* — particularly
where a decision looks odd, because the odd-looking decisions here usually have a
reason worth recording.
