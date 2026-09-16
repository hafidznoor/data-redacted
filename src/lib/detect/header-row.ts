import type { CellValue } from '../redact/types'
import type { Row } from '../excel/read'

/**
 * Header row detection.
 *
 * Row 1 is a bad assumption: real exports carry report titles, logos, export
 * timestamps and blank spacers above the actual headers. We score the first
 * few rows and pick the best, but only commit when the winner is clearly ahead
 * — otherwise the user is asked, which is better than being confidently wrong.
 */

export const MAX_HEADER_SCAN = 10
/** Below this, detection is a coin flip and the user should decide. */
export const CONFIDENCE_FLOOR = 0.55

const isBlank = (v: CellValue) => v === null || v === undefined || String(v).trim() === ''
const isText = (v: CellValue) => typeof v === 'string' && v.trim() !== '' && !/^\d+([.,]\d+)?$/.test(v.trim())

export interface HeaderRowResult {
  /** Zero-based index of the detected header row, or null when inconclusive. */
  index: number | null
  confidence: number
  /** Every candidate's score, so the UI can show its working. */
  scores: Array<{ index: number; score: number; preview: string[] }>
}

function scoreRow(row: Row, next: Row | undefined): number {
  const cells = row ?? []
  const filled = cells.filter((c) => !isBlank(c))
  if (filled.length < 2) return 0

  // 1. Density — a header row is mostly filled, not one stray title cell.
  const density = filled.length / Math.max(cells.length, 1)

  // 2. Textiness — headers are labels, not measurements.
  const textiness = filled.filter(isText).length / filled.length

  // 3. Uniqueness — duplicate headers are rare, duplicate data is common.
  const distinct = new Set(filled.map((c) => String(c).trim().toLowerCase()))
  const uniqueness = distinct.size / filled.length

  // 4. Divergence — the strongest signal. A row of labels sitting above a row
  //    of numbers or dates is the classic header shape.
  let divergence = 0
  if (next) {
    const pairs = cells
      .map((c, i) => [c, next[i]] as const)
      .filter(([a, b]) => !isBlank(a) && !isBlank(b))
    if (pairs.length) {
      const differing = pairs.filter(([a, b]) => isText(a) !== isText(b)).length
      divergence = differing / pairs.length
    }
  }

  return density * 0.2 + textiness * 0.3 + uniqueness * 0.2 + divergence * 0.3
}

export function detectHeaderRow(rows: Row[]): HeaderRowResult {
  const limit = Math.min(MAX_HEADER_SCAN, rows.length)
  const scores: HeaderRowResult['scores'] = []

  for (let i = 0; i < limit; i++) {
    scores.push({
      index: i,
      score: scoreRow(rows[i], rows[i + 1]),
      preview: (rows[i] ?? []).slice(0, 6).map((c) => (isBlank(c) ? '' : String(c))),
    })
  }

  const ranked = [...scores].sort((a, b) => b.score - a.score)
  const winner = ranked[0]
  if (!winner || winner.score < CONFIDENCE_FLOOR) {
    return { index: null, confidence: winner?.score ?? 0, scores }
  }

  // A clear winner should also be clearly ahead of the runner-up. Two rows that
  // both look like headers usually means a merged or two-line header, which is
  // exactly when a human should look.
  const runnerUp = ranked[1]?.score ?? 0
  const margin = winner.score - runnerUp
  const confidence = Math.min(1, winner.score * (margin > 0.1 ? 1 : 0.75))

  return {
    index: confidence >= CONFIDENCE_FLOOR ? winner.index : null,
    confidence,
    scores,
  }
}

/**
 * Header labels for a sheet. Blank header cells become `Column D` placeholders
 * so those columns stay selectable and nameable rather than disappearing.
 */
export function headersFrom(rows: Row[], headerRowIndex: number, columnLabel: (i: number) => string): string[] {
  const row = rows[headerRowIndex] ?? []
  const width = Math.max(row.length, ...rows.slice(0, 50).map((r) => r?.length ?? 0))
  return Array.from({ length: width }, (_, i) => {
    const cell = row[i]
    return isBlank(cell) ? `Column ${columnLabel(i)}` : String(cell).trim()
  })
}
