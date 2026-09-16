import type { CellValue, RedactMode, SemanticType } from '../redact/types'
import type { Row } from '../excel/read'
import { scoreHeader } from './lexicon'
import { VALUE_TESTS } from './validators'
import { isLowCardinality } from '../redact/hash'

export * from './lexicon'
export * from './validators'
export * from './header-row'

/** How many non-empty cells to sample per column. */
export const SAMPLE_SIZE = 200
/** Columns at or above this are pre-checked for the user. */
export const SUGGEST_THRESHOLD = 0.5

export interface ColumnProfile {
  index: number
  header: string
  semantic: SemanticType
  /** 0-1. How confident we are the column holds sensitive data. */
  score: number
  /** Where the confidence came from, shown in the UI so it can be judged. */
  reason: string
  distinctCount: number
  filledCount: number
  /** Redacted-safe examples: shape only, never a full value. */
  samples: string[]
  suggestedMode: RedactMode
  /** True when hashing would not actually hide anything (see hash.ts). */
  lowCardinality: boolean
}

/** Which mode fits a type best. Hash is the fallback when we have no opinion. */
export const MODE_FOR_TYPE: Record<SemanticType, RedactMode> = {
  email: 'partial',
  phone: 'partial',
  card: 'partial',
  nik: 'hash',
  npwp: 'hash',
  date: 'partial',
  name: 'fake',
  address: 'blank',
  currency: 'hash',
  text: 'blank',
  unknown: 'hash',
}

const isBlank = (v: CellValue) => v === null || v === undefined || String(v).trim() === ''

/** Truncate a sample so the UI can show shape without echoing a whole value. */
function safeSample(v: CellValue): string {
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
  return s.length > 18 ? s.slice(0, 15) + '…' : s
}

/**
 * Profile one column from its header and a sample of its values.
 *
 * The two signals are combined rather than averaged: a strong header match on
 * its own is enough (`nik` means NIK), and so is a strong value match on its
 * own (a column of Luhn-valid 16-digit numbers is cards whatever it's called).
 * Agreement between them pushes confidence higher still.
 */
export function profileColumn(
  index: number,
  header: string,
  values: CellValue[],
  totalRows: number,
): ColumnProfile {
  const filled = values.filter((v) => !isBlank(v))
  const sample = filled.slice(0, SAMPLE_SIZE)
  const distinct = new Set(filled.map((v) => (v instanceof Date ? v.toISOString() : String(v))))

  const headerMatch = scoreHeader(header)

  // Value signal: the type that the largest share of sampled values matches.
  let valueType: SemanticType = 'unknown'
  let valueScore = 0
  if (sample.length) {
    for (const { type, test, requiresHeader } of VALUE_TESTS) {
      // A permissive test only counts when the header agrees with it.
      if (requiresHeader && headerMatch.type !== type) continue

      let hits = 0
      for (const v of sample) if (test(v)) hits++
      const ratio = hits / sample.length
      // 70% is the floor for calling it: real columns have stray bad rows,
      // but a genuine email column is overwhelmingly emails.
      if (ratio >= 0.7 && ratio > valueScore) {
        valueScore = ratio
        valueType = type
      }
    }
  }

  let semantic: SemanticType = 'unknown'
  let score = 0
  let reason = 'No signal'

  const headerStrong = headerMatch.score >= 0.6 && headerMatch.type !== 'unknown'
  const valueStrong = valueScore >= 0.7

  if (headerStrong && valueStrong && headerMatch.type === valueType) {
    semantic = valueType
    score = Math.min(1, (headerMatch.score + valueScore) / 2 + 0.25)
    reason = `Header and values both look like ${valueType}`
  } else if (valueStrong) {
    semantic = valueType
    score = valueScore
    reason = `${Math.round(valueScore * 100)}% of sampled values match ${valueType}`
  } else if (headerStrong) {
    semantic = headerMatch.type
    score = headerMatch.score * 0.8
    reason = `Header name suggests ${headerMatch.type}`
  } else if (headerMatch.score > 0) {
    semantic = headerMatch.type
    score = headerMatch.score * 0.5
    reason = `Weak header match for ${headerMatch.type}`
  }

  // Free text that isn't anything recognisable is still worth offering, since
  // notes and comment fields routinely hide personal data.
  if (semantic === 'unknown' && sample.some((v) => String(v).length > 40)) {
    semantic = 'text'
    score = Math.max(score, 0.3)
    reason = 'Long free text — may contain personal data'
  }

  return {
    index,
    header,
    semantic,
    score: Math.round(score * 100) / 100,
    reason,
    distinctCount: distinct.size,
    filledCount: filled.length,
    samples: sample.slice(0, 3).map(safeSample),
    suggestedMode: MODE_FOR_TYPE[semantic] ?? 'hash',
    lowCardinality: isLowCardinality(distinct.size, totalRows),
  }
}

/** Profile every column of a sheet, given the resolved header row. */
export function profileSheet(rows: Row[], headerRowIndex: number, headers: string[]): ColumnProfile[] {
  const dataRows = rows.slice(headerRowIndex + 1)
  return headers.map((header, col) =>
    profileColumn(col, header, dataRows.map((r) => r?.[col]), dataRows.length),
  )
}
