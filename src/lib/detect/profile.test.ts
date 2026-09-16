import { describe, it, expect } from 'vitest'
import { profileColumn, profileSheet, scoreHeader, normaliseHeader, MODE_FOR_TYPE } from './index'
import type { Row } from '../excel/read'

const repeat = <T,>(v: T[], n: number): T[] => Array.from({ length: n }, (_, i) => v[i % v.length])

describe('normaliseHeader', () => {
  it('flattens separators and punctuation', () => {
    expect(normaliseHeader('No. HP  (Aktif)')).toBe('no hp aktif')
    expect(normaliseHeader('nama_lengkap')).toBe('nama lengkap')
  })
})

describe('scoreHeader', () => {
  it('scores an exact match highest', () => {
    expect(scoreHeader('nik')).toEqual({ type: 'nik', score: 1 })
  })
  it('matches a whole word inside a longer header', () => {
    const r = scoreHeader('nama_lengkap')
    expect(r.type).toBe('name')
    expect(r.score).toBeGreaterThan(0.8)
  })
  it('handles English headers too', () => {
    expect(scoreHeader('Email Address').type).toBe('email')
  })
  it('returns unknown for an unrelated header', () => {
    expect(scoreHeader('quantity_sold').type).toBe('unknown')
  })
})

describe('profileColumn', () => {
  it('scores highest when header and values agree', () => {
    const values = repeat(['budi@a.com', 'siti@b.com', 'agus@c.com'], 60)
    const p = profileColumn(0, 'email', values, 60)
    expect(p.semantic).toBe('email')
    expect(p.score).toBeGreaterThan(0.9)
    expect(p.reason).toContain('both')
  })

  it('detects from values alone when the header is meaningless', () => {
    const values = repeat(['budi@a.com', 'siti@b.com'], 60)
    const p = profileColumn(0, 'col_7', values, 60)
    expect(p.semantic).toBe('email')
    expect(p.score).toBeGreaterThanOrEqual(0.7)
  })

  it('detects from the header alone when values are unrecognisable', () => {
    const p = profileColumn(0, 'nama_lengkap', repeat(['x1', 'y2'], 60), 60)
    expect(p.semantic).toBe('name')
    expect(p.reason).toContain('Header')
  })

  it('finds a NIK column by value shape', () => {
    const values = repeat(['3175012501900001', '3174026502910002'], 60)
    const p = profileColumn(0, 'nomor', values, 60)
    expect(p.semantic).toBe('nik')
  })

  it('does not mistake order numbers for NIK', () => {
    const values = repeat(['9900889977665544', '9900889977665545'], 60)
    expect(profileColumn(0, 'order_ref', values, 60).semantic).not.toBe('nik')
  })

  it('flags a low-cardinality column so hashing is not oversold', () => {
    const p = profileColumn(0, 'gender', repeat(['L', 'P'], 1000), 1000)
    expect(p.lowCardinality).toBe(true)
  })

  it('counts distinct and filled values, ignoring blanks', () => {
    const p = profileColumn(0, 'x', ['a', 'b', 'a', null, '', undefined], 6)
    expect(p.filledCount).toBe(3)
    expect(p.distinctCount).toBe(2)
  })

  it('offers long free text, which often hides personal data', () => {
    const long = 'Customer called about a billing issue and left their number'
    const p = profileColumn(0, 'notes', repeat([long], 30), 30)
    expect(p.semantic).toBe('text')
  })

  it('truncates samples so the UI never echoes a whole value', () => {
    const p = profileColumn(0, 'x', repeat(['a'.repeat(50)], 10), 10)
    expect(p.samples[0].length).toBeLessThanOrEqual(18)
  })

  it('stays quiet on an ordinary numeric column', () => {
    const p = profileColumn(0, 'quantity', repeat([1, 2, 3, 4], 60), 60)
    expect(p.score).toBeLessThan(0.7)
  })
})

describe('profileSheet', () => {
  it('profiles each column against the resolved header row', () => {
    const rows: Row[] = [
      ['Nama', 'Email', 'Qty'],
      ...repeat([['Budi Santoso', 'budi@a.com', 3]], 40) as Row[],
    ]
    const profiles = profileSheet(rows, 0, ['Nama', 'Email', 'Qty'])
    expect(profiles).toHaveLength(3)
    expect(profiles[0].semantic).toBe('name')
    expect(profiles[1].semantic).toBe('email')
    expect(profiles[2].score).toBeLessThan(profiles[1].score)
  })
})

describe('MODE_FOR_TYPE', () => {
  it('falls back to hash where we have no better opinion', () => {
    expect(MODE_FOR_TYPE.unknown).toBe('hash')
  })
  it('prefers partial for types whose format carries meaning', () => {
    expect(MODE_FOR_TYPE.email).toBe('partial')
    expect(MODE_FOR_TYPE.phone).toBe('partial')
  })
})
