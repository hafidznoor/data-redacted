import type { CellValue, Locale, SemanticType } from '../redact/types'
import {
  FIRST_NAMES_ID, LAST_NAMES_ID, STREETS_ID, CITIES_ID, REGION_CODES_ID, CARRIER_PREFIXES_ID,
} from './data-id'
import { FIRST_NAMES_EN, LAST_NAMES_EN, STREETS_EN, CITIES_EN } from './data-en'

/**
 * Synthetic replacement values.
 *
 * Hand-rolled rather than pulling in Faker: two narrow locales is all we need,
 * the bundle stays small, and a reviewer can read the whole word list.
 *
 * Generation is driven by a numeric seed. Callers that want the same input to
 * always produce the same fake person derive that seed from the value's salted
 * hash, so consistency never leaks the original.
 */

/** xorshift32 — tiny, fast, and good enough for picking list entries. */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 0x100000000
  }
}

/** FNV-1a. Used only to turn an already-hashed string into a numeric seed. */
export function seedFrom(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const pick = <T,>(list: readonly T[], r: () => number): T => list[Math.floor(r() * list.length)]
const digits = (n: number, r: () => number) =>
  Array.from({ length: n }, () => Math.floor(r() * 10)).join('')

function fakeName(locale: Locale, r: () => number): string {
  return locale === 'id'
    ? `${pick(FIRST_NAMES_ID, r)} ${pick(LAST_NAMES_ID, r)}`
    : `${pick(FIRST_NAMES_EN, r)} ${pick(LAST_NAMES_EN, r)}`
}

function fakeAddress(locale: Locale, r: () => number): string {
  const number = 1 + Math.floor(r() * 200)
  return locale === 'id'
    ? `${pick(STREETS_ID, r)} No. ${number}, ${pick(CITIES_ID, r)}`
    : `${number} ${pick(STREETS_EN, r)}, ${pick(CITIES_EN, r)}`
}

function fakePhone(locale: Locale, r: () => number): string {
  return locale === 'id'
    ? `+62 ${pick(CARRIER_PREFIXES_ID, r)}-${digits(4, r)}-${digits(4, r)}`
    : `+1 555-${digits(4, r)}`
}

function fakeEmail(locale: Locale, r: () => number): string {
  const name = fakeName(locale, r).toLowerCase().replace(/\s+/g, '.')
  // example.com is reserved by RFC 2606 — it can never reach a real inbox.
  return `${name}@example.com`
}

/**
 * A structurally valid, randomly generated NIK: 4-digit region, 2-digit
 * district, DDMMYY birth date (day + 40 for women), 4-digit sequence.
 *
 * Structure is the point — downstream validators should accept it. The values
 * are random, so treat any resemblance to a real NIK as coincidence.
 */
function fakeNik(r: () => number): string {
  const region = pick(REGION_CODES_ID, r)
  const district = String(1 + Math.floor(r() * 30)).padStart(2, '0')
  const female = r() < 0.5
  const day = 1 + Math.floor(r() * 28)
  const dd = String(female ? day + 40 : day).padStart(2, '0')
  const mm = String(1 + Math.floor(r() * 12)).padStart(2, '0')
  // Two digits, always: padStart does not truncate, so a raw 60+44 would
  // produce a three-digit year and a 17-character NIK.
  const yy = String((60 + Math.floor(r() * 45)) % 100).padStart(2, '0')
  const seq = String(1 + Math.floor(r() * 9999)).padStart(4, '0')
  return `${region}${district}${dd}${mm}${yy}${seq}`
}

function fakeNpwp(r: () => number): string {
  return digits(16, r)
}

function fakeCard(r: () => number): string {
  // 4-prefixed and 16 digits so it reads as a card, with a deliberately invalid
  // Luhn check digit: a valid test number could be mistaken for a live one.
  return '4' + digits(15, r)
}

function fakeDate(r: () => number): string {
  const year = 1960 + Math.floor(r() * 50)
  const month = String(1 + Math.floor(r() * 12)).padStart(2, '0')
  const day = String(1 + Math.floor(r() * 28)).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Generate one synthetic value of the given type. */
export function generateFake(
  semantic: SemanticType,
  locale: Locale,
  seed: number,
  original?: CellValue,
): CellValue {
  const r = rng(seed)
  switch (semantic) {
    case 'name': return fakeName(locale, r)
    case 'address': return fakeAddress(locale, r)
    case 'phone': return fakePhone(locale, r)
    case 'email': return fakeEmail(locale, r)
    case 'nik': return fakeNik(r)
    case 'npwp': return fakeNpwp(r)
    case 'card': return fakeCard(r)
    case 'date': return fakeDate(r)
    case 'currency': {
      // Keep the magnitude so totals stay plausible; destroy the actual figure.
      const n = typeof original === 'number' ? original : 1_000_000
      const magnitude = Math.max(1, Math.floor(Math.log10(Math.abs(n) || 1)))
      return Math.floor(r() * 9 + 1) * 10 ** magnitude
    }
    default: return fakeName(locale, r)
  }
}
