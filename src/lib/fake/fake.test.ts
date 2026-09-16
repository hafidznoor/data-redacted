import { describe, it, expect } from 'vitest'
import { generateFake, seedFrom } from './index'
import { isNik, isNpwp, isEmail, isPhone, luhn } from '../detect/validators'

describe('seedFrom', () => {
  it('is stable for the same input', () => {
    expect(seedFrom('abc')).toBe(seedFrom('abc'))
  })
  it('differs across inputs', () => {
    expect(seedFrom('abc')).not.toBe(seedFrom('abd'))
  })
})

describe('generateFake — determinism', () => {
  it('returns the same value for the same seed', () => {
    expect(generateFake('name', 'id', 42)).toBe(generateFake('name', 'id', 42))
  })
  it('returns different values for different seeds', () => {
    const values = new Set(Array.from({ length: 50 }, (_, i) => generateFake('name', 'id', i * 7919)))
    expect(values.size).toBeGreaterThan(10)
  })
})

describe('generateFake — locale', () => {
  it('produces Indonesian names for id', () => {
    const names = Array.from({ length: 40 }, (_, i) => String(generateFake('name', 'id', i * 31)))
    expect(names.some((n) => /Budi|Siti|Santoso|Wijaya|Agus|Dewi/.test(n))).toBe(true)
  })
  it('produces English names for en', () => {
    const names = Array.from({ length: 40 }, (_, i) => String(generateFake('name', 'en', i * 31)))
    expect(names.some((n) => /James|Mary|Smith|Johnson|Brown/.test(n))).toBe(true)
  })
  it('produces Indonesian addresses for id', () => {
    const a = String(generateFake('address', 'id', 5))
    expect(a).toMatch(/^Jl\./)
  })
})

describe('generateFake — structural validity', () => {
  it('generates NIK that pass the real validator', () => {
    for (let i = 0; i < 200; i++) {
      expect(isNik(String(generateFake('nik', 'id', i * 104729)))).toBe(true)
    }
  })
  it('generates valid-length NPWP', () => {
    expect(isNpwp(String(generateFake('npwp', 'id', 7)))).toBe(true)
  })
  it('generates parseable emails on the reserved example.com domain', () => {
    const e = String(generateFake('email', 'id', 11))
    expect(isEmail(e)).toBe(true)
    expect(e.endsWith('@example.com')).toBe(true)
  })
  it('generates recognisable phone numbers', () => {
    expect(isPhone(String(generateFake('phone', 'id', 3)))).toBe(true)
  })
  it('generates card-shaped numbers that deliberately fail Luhn', () => {
    // A Luhn-valid number could be mistaken for a live card in a test dataset.
    const failures = Array.from({ length: 30 }, (_, i) => String(generateFake('card', 'en', i * 13)))
      .filter((c) => !luhn(c))
    expect(failures.length).toBeGreaterThan(20)
  })
  it('generates ISO dates', () => {
    expect(String(generateFake('date', 'en', 9))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('generateFake — currency', () => {
  it('keeps the order of magnitude of the original', () => {
    const out = generateFake('currency', 'id', 5, 5_000_000) as number
    expect(out).toBeGreaterThanOrEqual(1_000_000)
    expect(out).toBeLessThan(100_000_000)
  })
  it('never returns the original figure', () => {
    expect(generateFake('currency', 'id', 5, 5_000_000)).not.toBe(5_000_000)
  })
})
