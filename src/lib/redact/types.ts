/** A value as it comes out of, and goes back into, a spreadsheet cell. */
export type CellValue = string | number | boolean | Date | null | undefined

/** What we think a column holds. Drives partial masking and fake generation. */
export type SemanticType =
  | 'email'
  | 'phone'
  | 'nik'
  | 'npwp'
  | 'card'
  | 'date'
  | 'name'
  | 'address'
  | 'currency'
  | 'text'
  | 'unknown'

export type RedactMode = 'blank' | 'partial' | 'hash' | 'fake'

export type Locale = 'id' | 'en'

export interface RedactOptions {
  /** blank: what to write in place of the value. Empty string clears the cell. */
  blankWith?: string
  /** partial: how many leading characters survive. Type-specific default. */
  keepStart?: number
  /** partial: how many trailing characters survive. Type-specific default. */
  keepEnd?: number
  /** partial/fake: the character used for masking. */
  maskChar?: string
  /** hash: 'sha256' truncates a digest, 'sequential' assigns ALIAS_0001. */
  hashStyle?: 'sha256' | 'sequential'
  /** hash: how many hex characters of the digest to keep. */
  hashLength?: number
  /** hash: prefix for sequential aliases. */
  aliasPrefix?: string
  /**
   * hash: a fixed salt makes output comparable across files — and makes a
   * low-entropy column brute-forceable. Session-random when omitted.
   */
  salt?: string
  /** fake: which locale the replacements are drawn from. */
  locale?: Locale
  /** fake: same input always yields the same fake value. */
  consistent?: boolean
}

/** A column, and what the user decided to do with it. */
export interface ColumnPlan {
  /** Zero-based position in the sheet. */
  index: number
  header: string
  semantic: SemanticType
  /** null means leave this column exactly as it is. */
  mode: RedactMode | null
  options: RedactOptions
}

/**
 * Everything a transform needs for one column.
 *
 * `lookup` is the important part: hash and consistent-fake are resolved ahead of
 * the row pass, so every distinct value is computed once rather than once per
 * cell, and the per-cell work stays synchronous.
 */
export interface RedactContext {
  mode: RedactMode
  semantic: SemanticType
  options: RedactOptions
  lookup?: Map<string, string>
}
