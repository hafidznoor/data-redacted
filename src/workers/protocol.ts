import type { ColumnPlan, RedactMode, SemanticType } from '../lib/redact/types'
import type { SheetSummary } from '../lib/excel/read'
import type { ColumnProfile, HeaderRowResult } from '../lib/detect'

/**
 * Worker protocol.
 *
 * The contract that keeps the privacy promise structural rather than
 * aspirational: file bytes and parsed rows live in the worker, and only
 * metadata, scores, a small preview sample and the finished Blob cross back.
 */

export type ExportScope = 'selected-only' | 'whole-workbook'
export type ExportFormat = 'xlsx' | 'csv'

export interface SheetJob {
  sheet: string
  headerRow: number
  plans: ColumnPlan[]
}

export type WorkerRequest =
  | { id: number; type: 'load'; file: File }
  | { id: number; type: 'analyze'; sheet: string; headerRow: number }
  | { id: number; type: 'preview'; sheet: string; headerRow: number; plans: ColumnPlan[]; limit: number }
  | { id: number; type: 'export'; jobs: SheetJob[]; scope: ExportScope; format: ExportFormat }

export interface AuditColumn {
  header: string
  mode: RedactMode
  semantic: SemanticType
  cellsChanged: number
}

export interface AuditSheet {
  name: string
  action: 'redacted' | 'passed-through' | 'dropped'
  rowCount: number
  columns: AuditColumn[]
}

export interface AuditReport {
  fileName: string
  generatedAt: string
  sourceHash: string
  outputHash: string
  scope: ExportScope
  format: ExportFormat
  sheets: AuditSheet[]
  totalCellsChanged: number
}

export interface PreviewRow {
  before: string[]
  after: string[]
}

export type WorkerResponse =
  | { id: number; type: 'loaded'; fileName: string; fileSize: number; sheets: SheetSummary[]; headerGuesses: Record<string, HeaderRowResult> }
  | { id: number; type: 'analyzed'; headers: string[]; columns: ColumnProfile[]; rowCount: number }
  | { id: number; type: 'previewed'; headers: string[]; rows: PreviewRow[] }
  | { id: number; type: 'exported'; blob: Blob; audit: AuditReport; fileName: string }
  | { id: number; type: 'progress'; phase: string; pct: number }
  | { id: number; type: 'error'; message: string }
