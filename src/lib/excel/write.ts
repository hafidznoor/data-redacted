import * as XLSX from 'xlsx'
import type { Row } from './read'

/**
 * Writers.
 *
 * Output is data-only by design: we build a fresh workbook from values rather
 * than round-tripping the original. Formulas, comments, defined names, hidden
 * rows and macros are dropped by construction, so none of them can smuggle the
 * original values past a redaction.
 *
 * Pass-through sheets are the deliberate exception, and they keep whatever they
 * carried — which is exactly why the UI has to name them before export.
 */

export interface SheetOutput {
  name: string
  rows: Row[]
}

export function buildWorkbook(sheets: SheetOutput[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows as unknown[][], { cellDates: true })
    // Excel caps sheet names at 31 chars and forbids : \ / ? * [ ]
    const safeName = sheet.name.replace(/[:\\/?*[\]]/g, '_').slice(0, 31) || 'Sheet1'
    XLSX.utils.book_append_sheet(wb, ws, safeName)
  }
  return wb
}

export function workbookToBlob(wb: XLSX.WorkBook): Blob {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true })
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function rowsToCsvBlob(rows: Row[]): Blob {
  const ws = XLSX.utils.aoa_to_sheet(rows as unknown[][], { cellDates: true })
  const csv = XLSX.utils.sheet_to_csv(ws)
  // BOM so Excel opens UTF-8 correctly — without it, Indonesian names with
  // accents render as mojibake on a default Windows install.
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
}

/** SHA-256 of the bytes, for the audit summary's before/after record. */
export async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
