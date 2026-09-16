/// <reference lib="webworker" />
import { parseWorkbook, sheetRows, summarise, columnLabel, type Row } from '../lib/excel/read'
import { buildWorkbook, workbookToBlob, rowsToCsvBlob, hashBlob } from '../lib/excel/write'
import { detectHeaderRow, headersFrom, profileSheet } from '../lib/detect'
import { buildLookup, contextFor, keyOf, redactValue } from '../lib/redact'
import type { CellValue, ColumnPlan } from '../lib/redact/types'
import type { AuditReport, AuditSheet, PreviewRow, SheetJob, WorkerRequest, WorkerResponse } from './protocol'
import type * as XLSX from 'xlsx'

/**
 * All file bytes live here and nowhere else.
 *
 * The main thread holds column metadata, detection scores, a small preview
 * sample and the finished Blob — never a parsed workbook, never a full row.
 * That is what keeps 500k rows out of React's render tree, and it narrows the
 * surface where data could be logged or persisted by accident.
 */

let workbook: XLSX.WorkBook | null = null
let sourceFileName = ''
let sourceHash = ''
const rowCache = new Map<string, Row[]>()

const post = (msg: WorkerResponse) => self.postMessage(msg)

function rowsFor(sheet: string): Row[] {
  let rows = rowCache.get(sheet)
  if (!rows) {
    rows = sheetRows(workbook!, sheet)
    rowCache.set(sheet, rows)
  }
  return rows
}

const display = (v: CellValue): string => {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v)
}

/**
 * Resolve every planned column's lookup table before touching a single row.
 * Hash and consistent-fake are async and per-distinct-value; doing them here
 * keeps the row pass synchronous and O(rows) rather than O(rows × async).
 */
async function prepareLookups(rows: Row[], headerRow: number, plans: ColumnPlan[]) {
  const dataRows = rows.slice(headerRow + 1)
  const lookups = new Map<number, Map<string, string>>()

  for (const plan of plans) {
    if (!plan.mode || plan.mode === 'blank' || plan.mode === 'partial') continue

    // First-appearance order, which is what makes sequential aliases stable.
    const seen = new Set<string>()
    const distinct: string[] = []
    for (const row of dataRows) {
      const value = row?.[plan.index]
      if (value === null || value === undefined || value === '') continue
      const key = keyOf(value)
      if (!seen.has(key)) {
        seen.add(key)
        distinct.push(key)
      }
    }

    const lookup = await buildLookup(plan.mode, distinct, plan.semantic, plan.options)
    if (lookup) lookups.set(plan.index, lookup)
  }

  return lookups
}

/** Apply a sheet's plans. Returns the new rows and a per-column change count. */
async function redactSheet(
  job: SheetJob,
  onProgress?: (pct: number) => void,
): Promise<{ rows: Row[]; changed: Map<number, number> }> {
  const rows = rowsFor(job.sheet)
  const active = job.plans.filter((p) => p.mode !== null)
  const lookups = await prepareLookups(rows, job.headerRow, active)
  const contexts = new Map(active.map((p) => [p.index, contextFor(p, lookups.get(p.index))]))
  const changed = new Map<number, number>(active.map((p) => [p.index, 0]))

  // Headers first, then data. Rows above the header row are dropped: they are
  // report titles and export stamps, not data, and they can carry the same
  // personal information we were asked to remove.
  const out: Row[] = [rows[job.headerRow] ?? []]
  const total = rows.length - job.headerRow - 1

  for (let i = job.headerRow + 1; i < rows.length; i++) {
    const source = rows[i] ?? []
    const next = source.slice()
    for (const [index, ctx] of contexts) {
      const before = next[index]
      if (before === null || before === undefined || before === '') continue
      const after = redactValue(before, ctx)
      if (after !== before) changed.set(index, (changed.get(index) ?? 0) + 1)
      next[index] = after
    }
    out.push(next)

    if (onProgress && total > 0 && i % 5000 === 0) {
      onProgress((i - job.headerRow) / total)
    }
  }

  return { rows: out, changed }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  try {
    switch (req.type) {
      case 'load': {
        const buffer = await req.file.arrayBuffer()
        sourceHash = await hashBlob(new Blob([buffer]))
        sourceFileName = req.file.name
        workbook = parseWorkbook(buffer)
        rowCache.clear()

        const sheets = summarise(workbook)
        const headerGuesses: Record<string, ReturnType<typeof detectHeaderRow>> = {}
        for (const sheet of sheets) {
          headerGuesses[sheet.name] = detectHeaderRow(rowsFor(sheet.name).slice(0, 12))
        }

        post({
          id: req.id, type: 'loaded',
          fileName: req.file.name, fileSize: req.file.size,
          sheets, headerGuesses,
        })
        break
      }

      case 'analyze': {
        const rows = rowsFor(req.sheet)
        const headers = headersFrom(rows, req.headerRow, columnLabel)
        post({
          id: req.id, type: 'analyzed',
          headers,
          columns: profileSheet(rows, req.headerRow, headers),
          rowCount: Math.max(0, rows.length - req.headerRow - 1),
        })
        break
      }

      case 'preview': {
        const rows = rowsFor(req.sheet)
        const headers = headersFrom(rows, req.headerRow, columnLabel)
        const active = req.plans.filter((p) => p.mode !== null)

        // Preview only has to be convincing, not complete, so lookups are built
        // from the sampled slice rather than the whole column. Sequential
        // aliases will therefore differ from the final export, which is fine —
        // the preview is there to show the shape of the result.
        const slice = rows.slice(req.headerRow + 1, req.headerRow + 1 + req.limit)
        const lookups = await prepareLookups([[], ...slice], 0, active)
        const contexts = new Map(active.map((p) => [p.index, contextFor(p, lookups.get(p.index))]))

        const out: PreviewRow[] = slice.map((source) => {
          const row = source ?? []
          return {
            before: headers.map((_, c) => display(row[c])),
            after: headers.map((_, c) => {
              const ctx = contexts.get(c)
              const value = row[c]
              if (!ctx || value === null || value === undefined || value === '') return display(value)
              return display(redactValue(value, ctx))
            }),
          }
        })

        post({ id: req.id, type: 'previewed', headers, rows: out })
        break
      }

      case 'export': {
        const sheetsOut: Array<{ name: string; rows: Row[] }> = []
        const audit: AuditSheet[] = []
        let totalChanged = 0

        const redactedNames = new Set(req.jobs.map((j) => j.sheet))
        const allNames = workbook!.SheetNames

        for (let j = 0; j < req.jobs.length; j++) {
          const job = req.jobs[j]
          post({ id: req.id, type: 'progress', phase: `Redacting ${job.sheet}`, pct: j / req.jobs.length })

          const { rows, changed } = await redactSheet(job, (pct) =>
            post({ id: req.id, type: 'progress', phase: `Redacting ${job.sheet}`, pct: (j + pct) / req.jobs.length }),
          )
          sheetsOut.push({ name: job.sheet, rows })

          const columns = job.plans
            .filter((p) => p.mode !== null)
            .map((p) => ({
              header: p.header,
              mode: p.mode!,
              semantic: p.semantic,
              cellsChanged: changed.get(p.index) ?? 0,
            }))
          totalChanged += columns.reduce((sum, c) => sum + c.cellsChanged, 0)
          audit.push({ name: job.sheet, action: 'redacted', rowCount: Math.max(0, rows.length - 1), columns })
        }

        // Sheets the user did not select. Passed through untouched only when
        // they explicitly chose whole-workbook — the UI names them first.
        for (const name of allNames) {
          if (redactedNames.has(name)) continue
          if (req.scope === 'whole-workbook') {
            const rows = rowsFor(name)
            sheetsOut.push({ name, rows })
            audit.push({ name, action: 'passed-through', rowCount: rows.length, columns: [] })
          } else {
            audit.push({ name, action: 'dropped', rowCount: 0, columns: [] })
          }
        }

        post({ id: req.id, type: 'progress', phase: 'Writing file', pct: 0.95 })

        const base = sourceFileName.replace(/\.[^.]+$/, '')
        let blob: Blob
        let fileName: string
        if (req.format === 'csv') {
          // CSV has no concept of sheets, so it carries the first redacted one.
          blob = rowsToCsvBlob(sheetsOut[0]?.rows ?? [])
          fileName = `${base}-redacted.csv`
        } else {
          blob = workbookToBlob(buildWorkbook(sheetsOut))
          fileName = `${base}-redacted.xlsx`
        }

        const report: AuditReport = {
          fileName: sourceFileName,
          generatedAt: new Date().toISOString(),
          sourceHash,
          outputHash: await hashBlob(blob),
          scope: req.scope,
          format: req.format,
          sheets: audit,
          totalCellsChanged: totalChanged,
        }

        post({ id: req.id, type: 'exported', blob, audit: report, fileName })
        break
      }
    }
  } catch (error) {
    post({ id: req.id, type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
