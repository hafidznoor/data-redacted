import type { CellValue, SemanticType } from '../redact/types'

/**
 * Value-shape validators.
 *
 * Each returns true only when a value genuinely matches the type. Being strict
 * here matters more than catching everything: a false positive silently
 * redacts a column the user needed, which is a worse failure than a miss they
 * can see and correct.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/

export function isEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim())
}

/**
 * Indonesian mobile (08xx / +628xx / 628xx) or general E.164.
 * The 8-digit floor rejects years, postcodes and order numbers.
 */
export function isPhone(v: string): boolean {
  const s = v.trim()
  if (!/^\+?[\d\s().-]{8,20}$/.test(s)) return false
  const digits = s.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return false
  if (/^(0|62|\+62)8/.test(s.replace(/[\s().-]/g, ''))) return true
  return s.startsWith('+') && digits.length >= 10
}

/**
 * NIK: 16 digits, where positions 7-12 encode DDMMYY. Women have 40 added to
 * the day. Checking that the embedded date is real is what separates a NIK
 * from any other 16-digit number — an order ID will fail it almost always.
 */
export function isNik(v: string): boolean {
  const digits = String(v).replace(/\D/g, '')
  if (digits.length !== 16) return false
  if (/^0/.test(digits)) return false

  let day = parseInt(digits.slice(6, 8), 10)
  const month = parseInt(digits.slice(8, 10), 10)
  if (day > 40) day -= 40
  if (day < 1 || day > 31) return false
  if (month < 1 || month > 12) return false

  const province = parseInt(digits.slice(0, 2), 10)
  return province >= 11 && province <= 96
}

/** NPWP: 15 digits historically, 16 since the NIK migration. */
export function isNpwp(v: string): boolean {
  const digits = String(v).replace(/\D/g, '')
  return digits.length === 15 || digits.length === 16
}

/** Luhn checksum — the standard structural test for a payment card. */
export function luhn(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

export function isCard(v: string): boolean {
  const digits = String(v).replace(/[\s-]/g, '')
  if (!/^\d{13,19}$/.test(digits)) return false
  return luhn(digits)
}

/**
 * Date-shape tests.
 *
 * Deliberately avoids `Date.parse` for the slash/dash forms: JavaScript reads
 * `25/01/1990` as month 25 and returns NaN, which would reject the standard
 * Indonesian and European day-first format outright. Components are range
 * checked directly instead, accepting either ordering.
 */
function isDayFirstOrMonthFirst(a: number, b: number): boolean {
  const plausible = (day: number, month: number) => day >= 1 && day <= 31 && month >= 1 && month <= 12
  return plausible(a, b) || plausible(b, a)
}

function isDateString(s: string): boolean {
  // ISO: 1990-01-25
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    const month = +iso[2]
    const day = +iso[3]
    return month >= 1 && month <= 12 && day >= 1 && day <= 31
  }

  // 25/01/1990 or 25-01-1990, either ordering
  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slash) return isDayFirstOrMonthFirst(+slash[1], +slash[2])

  // 25 January 1990
  if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(s)) return !Number.isNaN(Date.parse(s))

  return false
}

export function isDate(v: CellValue): boolean {
  if (v instanceof Date) return !Number.isNaN(v.getTime())
  if (typeof v === 'number') {
    // Excel serial dates, floored at 1927 rather than 1900. The theoretical
    // range starts at 1, but accepting it would classify every small integer —
    // quantities, ratings, counts — as a date. Business data rarely predates
    // the 1930s, so the false-positive cost far outweighs the coverage.
    return v >= 10000 && v < 60000 && Number.isInteger(v)
  }
  return isDateString(String(v).trim())
}

export function isCurrency(v: CellValue): boolean {
  if (typeof v === 'number') return Number.isFinite(v)
  const s = String(v).trim()
  return /^(Rp|IDR|USD|\$|€|£)?\s?-?[\d.,]+(\s?(Rp|IDR|USD))?$/i.test(s) && /\d/.test(s)
}

/**
 * Two to four capitalised words and no digits. Deliberately loose — the header
 * lexicon carries most of the weight for names.
 */
export function looksLikeName(v: string): boolean {
  const s = v.trim()
  if (!s || /\d/.test(s)) return false
  const words = s.split(/\s+/)
  if (words.length < 2 || words.length > 4) return false
  return words.every((w) => /^[A-ZÀ-ɏ][a-zÀ-ɏ.'-]*$/.test(w))
}

export function looksLikeAddress(v: string): boolean {
  const s = v.trim()
  if (s.length < 10) return false
  return /\b(jl\.?|jalan|gang|gg\.?|blok|rt|rw|no\.?|street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|lane|ln\.?|blvd)\b/i.test(s)
}

/**
 * Ordered most-specific first, so a NIK is never mistaken for a plain number.
 *
 * `requiresHeader` marks a type whose value test is too permissive to stand on
 * its own: every number matches `isCurrency`, so without this every quantity,
 * rating and ID column would be confidently mislabelled as money.
 */
export const VALUE_TESTS: Array<{ type: SemanticType; test: (v: CellValue) => boolean; requiresHeader?: boolean }> = [
  { type: 'email', test: (v) => typeof v !== 'object' && isEmail(String(v)) },
  { type: 'nik', test: (v) => isNik(String(v)) },
  { type: 'card', test: (v) => isCard(String(v)) },
  { type: 'npwp', test: (v) => isNpwp(String(v)) },
  { type: 'phone', test: (v) => isPhone(String(v)) },
  { type: 'date', test: isDate },
  { type: 'address', test: (v) => looksLikeAddress(String(v)) },
  { type: 'name', test: (v) => looksLikeName(String(v)) },
  { type: 'currency', test: isCurrency, requiresHeader: true },
]

/**
 * Embedded personal data.
 *
 * The tests above ask "is this value an email?". These ask "does this value
 * *contain* one?" — which is how personal data actually hides in the wild:
 * free-text notes like "Approved by Budi Santoso" or "call her on 0812...".
 * A column of those looks unremarkable to a whole-value matcher and sails
 * through unredacted, which is the most damaging kind of miss.
 */
const EMBEDDED = [
  { kind: 'email', re: /[^\s@]+@[^\s@.]+\.[a-z]{2,}/i },
  { kind: 'phone', re: /(?:\+?62|0)8\d{2}[\s.-]?\d{3,4}[\s.-]?\d{3,5}/ },
  { kind: 'nik', re: /\b\d{16}\b/ },
  // A capitalised pair after a preposition or role word: "Approved by Budi
  // Santoso", "PIC: Siti Rahayu". Narrow on purpose — a looser rule would fire
  // on every sentence that happens to start two words with capitals.
  {
    kind: 'name',
    re: /\b(?:by|oleh|dari|kepada|a\.?n\.?|atas nama|pic|contact|hubungi|penanggung jawab)\b[:\s]+[A-Z][a-z]+\s+[A-Z][a-z]+/i,
  },
] as const

export type EmbeddedKind = (typeof EMBEDDED)[number]['kind']

/** Which kinds of personal data appear inside this value, if any. */
export function findEmbedded(value: CellValue): EmbeddedKind[] {
  const s = String(value ?? '')
  // Short values are handled well by the whole-value tests; scanning them here
  // only adds false positives.
  if (s.length < 12) return []
  return EMBEDDED.filter(({ re }) => re.test(s)).map(({ kind }) => kind)
}
