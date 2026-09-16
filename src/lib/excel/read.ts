import * as XLSX from 'xlsx'
import type { CellValue } from '../redact/types'

/**
 * SheetJS wrapper. Everything here runs inside the worker — the main thread
 * never sees a workbook or a row of data.
 */

export interface SheetSummary {
  name: string
  rowCount: number
  colCount: number
}

export type Row = CellValue[]

export function parseWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    // Skip styles, formulas and other non-value baggage: we write a fresh
    // data-only workbook, so parsing them is wasted work on a large file.
    cellStyles: false,
    cellFormula: false,
    dense: true,
  })
}

/** Rows as arrays. `defval: null` keeps column alignment when cells are empty. */
export function sheetRows(wb: XLSX.WorkBook, sheetName: string): Row[] {
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: null, blankrows: true })
}

export function summarise(wb: XLSX.WorkBook): SheetSummary[] {
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const ref = ws?.['!ref']
    if (!ref) return { name, rowCount: 0, colCount: 0 }
    const range = XLSX.utils.decode_range(ref)
    return {
      name,
      rowCount: range.e.r - range.s.r + 1,
      colCount: range.e.c - range.s.c + 1,
    }
  })
}

/** Spreadsheet-style column label for a zero-based index: 0 → A, 26 → AA. */
export function columnLabel(index: number): string {
  let label = ''
  let n = index
  while (n >= 0) {
    label = String.fromCharCode((n % 26) + 65) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

export { XLSX }
