import { describe, it, expect } from 'vitest'
import { detectHeaderRow, headersFrom } from './header-row'
import { columnLabel } from '../excel/read'
import type { Row } from '../excel/read'

describe('detectHeaderRow', () => {
  it('finds headers in row 0 of a clean sheet', () => {
    const rows: Row[] = [
      ['Nama', 'Email', 'Gaji'],
      ['Budi Santoso', 'budi@a.com', 5000000],
      ['Siti Rahayu', 'siti@a.com', 7000000],
    ]
    expect(detectHeaderRow(rows).index).toBe(0)
  })

  it('skips a report title and a blank spacer above the real headers', () => {
    const rows: Row[] = [
      ['LAPORAN KARYAWAN 2026', null, null],
      [null, null, null],
      ['Nama', 'Email', 'Gaji'],
      ['Budi Santoso', 'budi@a.com', 5000000],
      ['Siti Rahayu', 'siti@a.com', 7000000],
    ]
    expect(detectHeaderRow(rows).index).toBe(2)
  })

  it('reports every candidate so the UI can show its working', () => {
    const rows: Row[] = [['Title'], ['Nama', 'Email'], ['Budi', 'b@a.com']]
    expect(detectHeaderRow(rows).scores.length).toBe(3)
  })

  it('declines to guess when nothing looks like a header', () => {
    const rows: Row[] = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]
    expect(detectHeaderRow(rows).index).toBeNull()
  })

  it('handles an empty sheet without throwing', () => {
    expect(detectHeaderRow([]).index).toBeNull()
  })
})

describe('headersFrom', () => {
  it('reads the labels from the chosen row', () => {
    const rows: Row[] = [['Nama', 'Email'], ['Budi', 'b@a.com']]
    expect(headersFrom(rows, 0, columnLabel)).toEqual(['Nama', 'Email'])
  })

  it('names blank header cells so the column stays selectable', () => {
    const rows: Row[] = [['Nama', null, 'Gaji'], ['Budi', 'x', 100]]
    expect(headersFrom(rows, 0, columnLabel)).toEqual(['Nama', 'Column B', 'Gaji'])
  })

  it('widens to the widest data row when the header row is short', () => {
    const rows: Row[] = [['Nama'], ['Budi', 'extra', 'more']]
    expect(headersFrom(rows, 0, columnLabel)).toHaveLength(3)
  })
})

describe('columnLabel', () => {
  it('matches spreadsheet lettering past Z', () => {
    expect(columnLabel(0)).toBe('A')
    expect(columnLabel(25)).toBe('Z')
    expect(columnLabel(26)).toBe('AA')
    expect(columnLabel(27)).toBe('AB')
  })
})
