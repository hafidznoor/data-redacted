import type { CellValue, RedactOptions, SemanticType } from './types'

const DEFAULT_MASK = '*'

/**
 * Format-preserving masking.
 *
 * Every function here keeps the *shape* of a value and destroys the content.
 * Defaults lean conservative: it is easy for a user to choose to reveal more,
 * and impossible to un-share a file that revealed more than they realised.
 */

function repeat(char: string, n: number) {
  return n > 0 ? char.repeat(n) : ''
}

/** Mask the middle, keeping a prefix and suffix. Never reveals more than half. */
export function maskGeneric(value: string, keepStart = 1, keepEnd = 0, maskChar = DEFAULT_MASK): string {
  if (!value) return value
  const chars = [...value]
  // A short value can't spare both ends without giving itself away, so anything
  // under 4 characters is masked completely.
  if (chars.length < 4) return repeat(maskChar, chars.length)

  const maxReveal = Math.floor(chars.length / 2)
  let start = Math.max(0, keepStart)
  let end = Math.max(0, keepEnd)
  while (start + end > maxReveal) {
    if (end >= start && end > 0) end--
    else if (start > 0) start--
    else break
  }

  const head = chars.slice(0, start).join('')
  const tail = end > 0 ? chars.slice(chars.length - end).join('') : ''
  return head + repeat(maskChar, chars.length - start - end) + tail
}

/** `budi.santoso@doku.com` → `b***@doku.com`. Domain survives; it is rarely the secret. */
export function maskEmail(value: string, maskChar = DEFAULT_MASK): string {
  const at = value.lastIndexOf('@')
  if (at < 1) return maskGeneric(value, 1, 0, maskChar)
  const local = value.slice(0, at)
  const domain = value.slice(at)
  const keep = local.length > 1 ? 1 : 0
  return local.slice(0, keep) + repeat(maskChar, Math.max(1, local.length - keep)) + domain
}

/**
 * `+628123456789` → `+6281****6789`. Keeps enough to recognise the country and
 * carrier, and the last 4 that people use to identify their own number.
 */
export function maskPhone(value: string, maskChar = DEFAULT_MASK): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 6) return repeat(maskChar, value.length)
  const plus = value.trimStart().startsWith('+') ? '+' : ''
  const start = Math.min(4, digits.length - 4)
  return plus + digits.slice(0, start) + repeat(maskChar, digits.length - start - 4) + digits.slice(-4)
}

/** First 6 and last 4 — the industry-standard PCI DSS display rule. */
export function maskCard(value: string, maskChar = DEFAULT_MASK): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 12) return maskGeneric(digits, 0, 4, maskChar)
  return digits.slice(0, 6) + repeat(maskChar, digits.length - 10) + digits.slice(-4)
}

/**
 * NIK: keep the 4-digit province+regency prefix, drop everything else.
 * The middle carries a birth date and the tail a sequence number, so both go.
 */
export function maskNik(value: string, maskChar = DEFAULT_MASK): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 16) return maskGeneric(digits, 4, 2, maskChar)
  return digits.slice(0, 4) + repeat(maskChar, 10) + digits.slice(-2)
}

/** NPWP: keep the first 2 digits only; the rest identifies the taxpayer. */
export function maskNpwp(value: string, maskChar = DEFAULT_MASK): string {
  const digits = value.replace(/\D/g, '')
  return digits.slice(0, 2) + repeat(maskChar, Math.max(0, digits.length - 2))
}

/**
 * Keep the year, drop month and day. Year alone is rarely identifying, and
 * keeps age-bracket analysis working.
 */
export function maskDate(value: CellValue, maskChar = DEFAULT_MASK): string {
  const mm = repeat(maskChar, 2)
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${mm}-${mm}`
  }
  const s = String(value ?? '')
  const year = s.match(/\b(19|20)\d{2}\b/)
  return year ? `${year[0]}-${mm}-${mm}` : repeat(maskChar, s.length)
}

/** `Budi Santoso` → `B*** S***`. Word count survives, which reads as a name. */
export function maskName(value: string, maskChar = DEFAULT_MASK): string {
  return value
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) || !part ? part : part[0] + repeat(maskChar, Math.max(0, part.length - 1))))
    .join('')
}

/** Digits go, structure stays: `Jl. Sudirman No. 45` → `Jl. Sudirman No. **`. */
export function maskAddress(value: string, maskChar = DEFAULT_MASK): string {
  return value.replace(/\d/g, maskChar)
}

/**
 * Dispatch on what the column was detected to hold. Anything we can't place
 * falls back to the generic masker, which is the conservative option.
 */
export function applyPartial(value: CellValue, semantic: SemanticType, options: RedactOptions = {}): CellValue {
  if (value === null || value === undefined || value === '') return value
  const mask = options.maskChar || DEFAULT_MASK

  if (semantic === 'date') return maskDate(value, mask)

  const s = String(value)
  switch (semantic) {
    case 'email': return maskEmail(s, mask)
    case 'phone': return maskPhone(s, mask)
    case 'card': return maskCard(s, mask)
    case 'nik': return maskNik(s, mask)
    case 'npwp': return maskNpwp(s, mask)
    case 'name': return maskName(s, mask)
    case 'address': return maskAddress(s, mask)
    // A partly-masked number is no longer a number, so currency is masked
    // whole rather than left half-readable.
    case 'currency': return repeat(mask, s.length)
    default: return maskGeneric(s, options.keepStart ?? 1, options.keepEnd ?? 0, mask)
  }
}
