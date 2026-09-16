import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseWorkbook, sheetRows, summarise, columnLabel } from './read'
import { buildWorkbook, workbookToBlob, rowsToCsvBlob, hashBlob } from './write'
import type { Row } from './read'

function makeFile(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

describe('parseWorkbook / sheetRows', () => {
  it('round-trips values', () => {
    const wb = parseWorkbook(makeFile({ Data: [['Nama', 'Gaji'], ['Budi', 5000000]] }))
    expect(sheetRows(wb, 'Data')).toEqual([['Nama', 'Gaji'], ['Budi', 5000000]])
  })

  it('keeps column alignment when cells are empty', () => {
    const wb = parseWorkbook(makeFile({ Data: [['A', 'B', 'C'], ['x', null, 'z']] }))
    const rows = sheetRows(wb, 'Data')
    expect(rows[1]).toHaveLength(3)
    expect(rows[1][2]).toBe('z')
  })

  it('returns an empty array for a missing sheet', () => {
    const wb = parseWorkbook(makeFile({ Data: [['A']] }))
    expect(sheetRows(wb, 'Nope')).toEqual([])
  })
})

describe('summarise', () => {
  it('reports each sheet with its dimensions', () => {
    const wb = parseWorkbook(makeFile({
      Employees: [['A', 'B'], ['1', '2'], ['3', '4']],
      Summary: [['X']],
    }))
    const sheets = summarise(wb)
    expect(sheets.map((s) => s.name)).toEqual(['Employees', 'Summary'])
    expect(sheets[0]).toMatchObject({ rowCount: 3, colCount: 2 })
  })
})

describe('buildWorkbook', () => {
  it('writes every sheet it is given', () => {
    const wb = buildWorkbook([
      { name: 'One', rows: [['a'], ['b']] as Row[] },
      { name: 'Two', rows: [['c']] as Row[] },
    ])
    expect(wb.SheetNames).toEqual(['One', 'Two'])
  })

  it('sanitises names Excel would reject', () => {
    const wb = buildWorkbook([{ name: 'Bad/Name:Here', rows: [['a']] as Row[] }])
    expect(wb.SheetNames[0]).toBe('Bad_Name_Here')
  })

  it('truncates names past the 31-character limit', () => {
    const wb = buildWorkbook([{ name: 'x'.repeat(50), rows: [['a']] as Row[] }])
    expect(wb.SheetNames[0].length).toBeLessThanOrEqual(31)
  })
})

describe('data-only output', () => {
  it('drops formulas, so they cannot smuggle an original value through', () => {
    // A formula referencing a redacted cell would otherwise survive and
    // recompute — or carry a cached result of the pre-redaction value.
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['Nama', 'Gaji', 'Bonus'], ['Budi', 5000000, 0]])
    ws['C2'] = { t: 'n', f: 'B2*0.1', v: 500000 }
    XLSX.utils.book_append_sheet(wb, ws, 'Data')
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer

    const rows = sheetRows(parseWorkbook(buffer), 'Data')
    const rebuilt = buildWorkbook([{ name: 'Data', rows }])
    const cells = Object.values(rebuilt.Sheets.Data) as Array<{ f?: string }>
    expect(cells.some((c) => c && typeof c === 'object' && 'f' in c)).toBe(false)
  })

  it('produces a workbook that reads back with the redacted values', async () => {
    const redacted: Row[] = [['Nama', 'Email'], ['B*** S******', 'b***@doku.com']]
    const blob = workbookToBlob(buildWorkbook([{ name: 'Data', rows: redacted }]))
    const rows = sheetRows(parseWorkbook(await blob.arrayBuffer()), 'Data')
    expect(rows).toEqual(redacted)
    expect(JSON.stringify(rows)).not.toContain('Budi')
  })
})

describe('rowsToCsvBlob', () => {
  it('writes a UTF-8 BOM so Excel does not mangle accented names', async () => {
    const blob = rowsToCsvBlob([['Nama'], ['Budi Santoso']] as Row[])
    // Checked as bytes, not text: Blob.text() strips a leading BOM per
    // spec, so decoding would hide whether we actually wrote one.
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 3)
    expect([...head]).toEqual([0xef, 0xbb, 0xbf])
  })

  it('includes the data', async () => {
    const text = await rowsToCsvBlob([['Nama', 'Kota'], ['Budi', 'Jakarta']] as Row[]).text()
    expect(text).toContain('Budi')
    expect(text).toContain('Jakarta')
  })
})

describe('hashBlob', () => {
  it('produces a stable SHA-256 hex digest', async () => {
    const a = await hashBlob(new Blob(['hello']))
    expect(a).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
  it('differs when the content differs', async () => {
    expect(await hashBlob(new Blob(['a']))).not.toBe(await hashBlob(new Blob(['b'])))
  })
})

describe('columnLabel', () => {
  it('handles the two-letter range', () => {
    expect(columnLabel(51)).toBe('AZ')
    expect(columnLabel(52)).toBe('BA')
  })
})
