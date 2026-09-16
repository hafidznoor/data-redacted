import { describe, it, expect } from 'vitest'
import { buildHashLookup, isLowCardinality, randomSalt } from './hash'
import { buildLookup, redactValue, keyOf } from './index'
import type { RedactContext } from './types'

const ctx = (over: Partial<RedactContext>): RedactContext => ({
  mode: 'blank', semantic: 'unknown', options: {}, ...over,
})

describe('buildHashLookup — sha256', () => {
  it('is deterministic for a fixed salt', async () => {
    const a = await buildHashLookup(['budi', 'siti'], { salt: 'fixed' })
    const b = await buildHashLookup(['budi', 'siti'], { salt: 'fixed' })
    expect(a.get('budi')).toBe(b.get('budi'))
  })

  it('produces different output under a different salt', async () => {
    const a = await buildHashLookup(['budi'], { salt: 'one' })
    const b = await buildHashLookup(['budi'], { salt: 'two' })
    expect(a.get('budi')).not.toBe(b.get('budi'))
  })

  it('never returns the original value', async () => {
    const map = await buildHashLookup(['budi.santoso@doku.com'], { salt: 's' })
    expect(map.get('budi.santoso@doku.com')).not.toContain('budi')
  })

  it('maps distinct inputs to distinct outputs', async () => {
    const inputs = Array.from({ length: 500 }, (_, i) => `user${i}`)
    const map = await buildHashLookup(inputs, { salt: 's' })
    expect(new Set(map.values()).size).toBe(500)
  })

  it('respects the configured digest length', async () => {
    const map = await buildHashLookup(['x'], { salt: 's', hashLength: 8 })
    expect(map.get('x')).toHaveLength(8)
  })

  it('handles more values than one chunk', async () => {
    const inputs = Array.from({ length: 4500 }, (_, i) => `v${i}`)
    const map = await buildHashLookup(inputs, { salt: 's' })
    expect(map.size).toBe(4500)
  })
})

describe('buildHashLookup — sequential', () => {
  it('numbers values in first-appearance order', async () => {
    const map = await buildHashLookup(['b', 'a', 'c'], { hashStyle: 'sequential', aliasPrefix: 'USER' })
    expect(map.get('b')).toBe('USER_0001')
    expect(map.get('a')).toBe('USER_0002')
    expect(map.get('c')).toBe('USER_0003')
  })
})

describe('randomSalt', () => {
  it('differs between calls', () => {
    expect(randomSalt()).not.toBe(randomSalt())
  })
})

describe('isLowCardinality', () => {
  it('flags a two-value column in a large sheet', () => {
    expect(isLowCardinality(2, 10_000)).toBe(true)
  })
  it('does not flag a high-cardinality column', () => {
    expect(isLowCardinality(9_000, 10_000)).toBe(false)
  })
  it('stays quiet on a sheet too small to judge', () => {
    expect(isLowCardinality(2, 10)).toBe(false)
  })
})

describe('redactValue', () => {
  it('leaves empty cells untouched in every mode', () => {
    for (const mode of ['blank', 'partial', 'hash', 'fake'] as const) {
      expect(redactValue(null, ctx({ mode }))).toBeNull()
      expect(redactValue('', ctx({ mode }))).toBe('')
    }
  })

  it('blanks to an empty string by default', () => {
    expect(redactValue('secret', ctx({ mode: 'blank' }))).toBe('')
  })

  it('blanks to a custom marker when given one', () => {
    expect(redactValue('secret', ctx({ mode: 'blank', options: { blankWith: '***REDACTED***' } })))
      .toBe('***REDACTED***')
  })

  it('resolves hashes through the prepared lookup', () => {
    const lookup = new Map([['budi', 'a1b2c3']])
    expect(redactValue('budi', ctx({ mode: 'hash', lookup }))).toBe('a1b2c3')
  })

  it('returns empty rather than the original when a hash is missing', () => {
    expect(redactValue('unknown', ctx({ mode: 'hash', lookup: new Map() }))).toBe('')
  })
})

describe('keyOf', () => {
  it('normalises dates stably', () => {
    const d = new Date('2020-05-05T00:00:00Z')
    expect(keyOf(d)).toBe(keyOf(new Date('2020-05-05T00:00:00Z')))
  })
  it('treats null and undefined as the empty key', () => {
    expect(keyOf(null)).toBe('')
    expect(keyOf(undefined)).toBe('')
  })
})

describe('buildLookup — consistent fake', () => {
  it('gives the same person the same fake name throughout', async () => {
    const map = await buildLookup('fake', ['Budi Santoso', 'Siti Rahayu'], 'name', { locale: 'id' })
    expect(map!.get('Budi Santoso')).toBe(map!.get('Budi Santoso'))
    expect(map!.get('Budi Santoso')).not.toBe('Budi Santoso')
  })

  it('gives different people different fake names', async () => {
    const map = await buildLookup('fake', ['A One', 'B Two', 'C Three'], 'name', { locale: 'id' })
    expect(new Set(map!.values()).size).toBeGreaterThan(1)
  })

  it('skips the lookup entirely when consistency is off', async () => {
    const map = await buildLookup('fake', ['x'], 'name', { consistent: false })
    expect(map).toBeUndefined()
  })

  it('needs no lookup for blank or partial', async () => {
    expect(await buildLookup('blank', ['x'], 'name')).toBeUndefined()
    expect(await buildLookup('partial', ['x'], 'name')).toBeUndefined()
  })
})
