import type { RedactOptions } from './types'

/**
 * Deterministic pseudonymisation.
 *
 * Same input always maps to the same output, so joins, counts and group-bys
 * survive redaction. Two styles:
 *
 *   sha256     — salted digest, truncated. Opaque.
 *   sequential — ALIAS_0001, ALIAS_0002. Readable, ordered by first appearance.
 *
 * Both are computed once per *distinct* value, not once per cell. On a 500k-row
 * sheet with 20k customers that is 25x less work, and it keeps the row pass
 * synchronous.
 */

const DEFAULT_HASH_LENGTH = 12

/** A fresh salt per session, so digests are not comparable across runs. */
export function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Resolve every distinct value in a column to its replacement.
 *
 * Callers pass distinct values in first-appearance order, which is what makes
 * sequential aliases stable and reviewable.
 */
export async function buildHashLookup(
  distinctValues: string[],
  options: RedactOptions = {},
): Promise<Map<string, string>> {
  const lookup = new Map<string, string>()

  if (options.hashStyle === 'sequential') {
    const prefix = options.aliasPrefix || 'ID'
    const width = Math.max(4, String(distinctValues.length).length)
    distinctValues.forEach((value, i) => {
      lookup.set(value, `${prefix}_${String(i + 1).padStart(width, '0')}`)
    })
    return lookup
  }

  const salt = options.salt || randomSalt()
  const length = Math.min(64, Math.max(4, options.hashLength ?? DEFAULT_HASH_LENGTH))

  // Chunked so a very wide column can't monopolise the worker's event loop.
  const CHUNK = 2000
  for (let i = 0; i < distinctValues.length; i += CHUNK) {
    const slice = distinctValues.slice(i, i + CHUNK)
    const hashes = await Promise.all(slice.map((v) => sha256Hex(salt + v)))
    slice.forEach((v, j) => lookup.set(v, hashes[j].slice(0, length)))
  }

  return lookup
}

/**
 * How many distinct values a column needs before hashing actually hides
 * anything. Below this, frequency analysis re-identifies the buckets: two
 * hashes in a 9:1 split over a `gender` column are not anonymous.
 */
export const LOW_CARDINALITY_THRESHOLD = 20

export function isLowCardinality(distinctCount: number, rowCount: number): boolean {
  if (rowCount < LOW_CARDINALITY_THRESHOLD * 2) return false
  return distinctCount < LOW_CARDINALITY_THRESHOLD
}
