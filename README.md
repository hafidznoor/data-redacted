# data-redacted

**Redact spreadsheet columns without uploading anything.**

Drop in an Excel file, pick the columns that hold sensitive data, choose how each
one gets redacted, download a clean copy. Your file is read in the browser tab
and never sent anywhere — no server, no analytics, no upload. Disconnect from the
internet and it still works.

→ **[hafidznoor.github.io/data-redacted](https://hafidznoor.github.io/data-redacted/)**

---

## Why

Sharing a spreadsheet with a vendor, a contractor or a support ticket usually
means sharing more than you meant to. The existing options are a colleague doing
find-and-replace by hand, or uploading the file to a website that promises to
delete it afterwards. This is the third option.

## Four ways to redact

| Mode | Example | Use when |
|---|---|---|
| **Blank** | `Budi Santoso` → `` | The column has no analytical value |
| **Partial** | `budi@doku.com` → `b***@doku.com` | The format matters but the content does not |
| **Hash** | `3175012501900001` → `60eb7beb110d` | You need joins, counts and group-bys to survive |
| **Fake** | `Budi Santoso` → `Agus Wijaya` | You need the file to look real, for a demo or test |

Hash and fake are **deterministic within a run**: the same customer gets the same
replacement everywhere, so your analysis still works. Hashes are salted per
session, so they are not comparable between runs unless you opt in.

## It suggests, you decide

The tool profiles every column from its header name *and* a sample of its values,
then pre-checks the ones that look sensitive and suggests a fitting mode.

It knows Indonesian formats: NIK is validated by checking the birth date encoded
in digits 7–12 (including the +40 day offset used for women), so a random
16-digit order number is not mistaken for an identity number. NPWP, `08xx`
phone numbers, Rupiah amounts and day-first dates are all recognised, alongside
the usual email, card (Luhn-checked) and international formats.

It also scans free-text columns for personal data hiding *inside* sentences —
`Approved by Budi Santoso` in a notes field is exactly the kind of thing that
slips through a whole-value matcher.

**Detection is a convenience, not a guarantee.** Check every column yourself.

## Things it is careful about

- **Header rows.** Real exports have report titles and blank spacers above the
  actual headers. The tool scores the first ten rows and picks the real one — and
  when it is not sure, it asks instead of guessing.
- **Low-cardinality columns.** Hashing a `gender` column does not hide anything:
  two hashes in a 9:1 split are identified by counting. The tool warns you and
  suggests blanking instead.
- **Sheets you did not review.** If you ask for the whole workbook, the sheets you
  did not pick are copied across unchanged. The tool names them, loudly, before
  you export — and again in the audit report.
- **Formulas.** The output is built fresh from values, so formulas, comments,
  defined names and macros are dropped rather than carried through where they
  could recompute or cache a pre-redaction value.

## Audit report

Every export can produce a JSON report: which columns, which mode, how many cells
changed, which sheets were passed through, and SHA-256 hashes of the file before
and after — so a reviewer can confirm the file they hold is the one described.

## Privacy

The claim is enforced, not just asserted: a strict CSP, no third-party anything,
an offline service worker, and a CI guard that fails the build if a network call
appears in the source. Two honest caveats are documented in **[PRIVACY.md](PRIVACY.md)**,
along with instructions for verifying all of it yourself in about thirty seconds.

## Built with

Vite · React 19 · TypeScript · Tailwind v4 · [shadcn/ui](https://ui.shadcn.com) ·
[rare-ui](https://github.com/swamimalode07/rare-ui) · [SheetJS](https://sheetjs.com)

## Development

```bash
npm install
npm run dev
```

```bash
npm test          # 132 unit tests
npm run typecheck
npm run build
```

See **[CONTRIBUTING.md](CONTRIBUTING.md)** before opening a pull request — there
is one dependency with an unusual install path, and one script you must not
disable.

## Status

Excel (`.xlsx`) only for now. CSV and other formats are planned. See
[PLAN.md](PLAN.md) for the full design and what is deliberately left out.

## License

MIT
