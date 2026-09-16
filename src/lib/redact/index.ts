import type { CellValue, ColumnPlan, RedactContext, RedactMode, RedactOptions, SemanticType } from './types'
import { applyPartial } from './partial'
import { buildHashLookup, randomSalt, isLowCardinality, LOW_CARDINALITY_THRESHOLD } from './hash'
import { generateFake, seedFrom } from '../fake'

export * from './types'
export * from './partial'
export { buildHashLookup, randomSalt, isLowCardinality, LOW_CARDINALITY_THRESHOLD }

/** Normalise a cell to the string key used for lookups. */
export function keyOf(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

/**
 * Resolve distinct values to replacements ahead of the row pass.
 *
 * Only hash and consistent-fake need this. Doing it up front means each distinct
 * value is computed once instead of once per row, and the per-cell transform
 * stays synchronous — which matters when the row pass is iterating 500k times.
 */
export async function buildLookup(
  mode: RedactMode,
  distinctValues: string[],
  semantic: SemanticType,
  options: RedactOptions = {},
): Promise<Map<string, string> | undefined> {
  if (mode === 'hash') {
    return buildHashLookup(distinctValues, options)
  }

  if (mode === 'fake' && options.consistent !== false) {
    // Seed each fake from the value's *salted* hash, so the same customer reads
    // as the same fake person throughout the file without the mapping being
    // reproducible by anyone who only knows the algorithm.
    const hashed = await buildHashLookup(distinctValues, {
      ...options,
      hashStyle: 'sha256',
      salt: options.salt || randomSalt(),
    })
    const lookup = new Map<string, string>()
    for (const [original, hash] of hashed) {
      lookup.set(original, String(generateFake(semantic, options.locale || 'id', seedFrom(hash))))
    }
    return lookup
  }

  return undefined
}

/**
 * Redact one cell. Pure and synchronous — anything expensive or async was
 * already resolved into `ctx.lookup`.
 */
export function redactValue(value: CellValue, ctx: RedactContext): CellValue {
  // An empty cell carries nothing to redact, and blanking it would destroy the
  // distinction between "no data" and "data removed".
  if (value === null || value === undefined || value === '') return value

  const { mode, semantic, options, lookup } = ctx

  switch (mode) {
    case 'blank':
      return options.blankWith ?? ''

    case 'partial':
      return applyPartial(value, semantic, options)

    case 'hash':
      return lookup?.get(keyOf(value)) ?? ''

    case 'fake': {
      if (options.consistent !== false) {
        return lookup?.get(keyOf(value)) ?? ''
      }
      // Inconsistent mode: a fresh value per cell. Same row-level realism, but
      // one person appears as several — only safe when rows are independent.
      return generateFake(semantic, options.locale || 'id', (Math.random() * 2 ** 32) >>> 0, value)
    }

    default:
      return value
  }
}

/** Turn a user's column decision into the context the row pass consumes. */
export function contextFor(plan: ColumnPlan, lookup?: Map<string, string>): RedactContext {
  return {
    mode: plan.mode as RedactMode,
    semantic: plan.semantic,
    options: plan.options,
    lookup,
  }
}

export const MODE_LABELS: Record<RedactMode, string> = {
  blank: 'Blank',
  partial: 'Partial',
  hash: 'Hash',
  fake: 'Fake',
}
