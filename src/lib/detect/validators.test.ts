import { describe, it, expect } from 'vitest'
import { isEmail, isPhone, isNik, isNpwp, isCard, luhn, isDate, isCurrency, looksLikeName, looksLikeAddress } from './validators'

describe('isEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isEmail('budi.santoso@doku.com')).toBe(true)
    expect(isEmail('a+tag@sub.example.co.id')).toBe(true)
  })
  it('rejects near-misses', () => {
    expect(isEmail('not an email')).toBe(false)
    expect(isEmail('missing@tld')).toBe(false)
    expect(isEmail('@nolocal.com')).toBe(false)
  })
})

describe('isNik', () => {
  it('accepts a valid NIK', () => {
    // 3175 01 250190 0001 — Jakarta, born 25 Jan 1990
    expect(isNik('3175012501900001')).toBe(true)
  })
  it('accepts the +40 day encoding used for women', () => {
    expect(isNik('3175016501900001')).toBe(true) // day 65 → 25
  })
  it('rejects a 16-digit number with an impossible date', () => {
    // This is the check that separates a NIK from an order ID.
    expect(isNik('3175019901900001')).toBe(false) // day 99
    expect(isNik('3175012599900001')).toBe(false) // month 99
  })
  it('rejects wrong lengths and invalid provinces', () => {
    expect(isNik('317501250190')).toBe(false)
    expect(isNik('9975012501900001')).toBe(false) // province 99
    expect(isNik('0175012501900001')).toBe(false) // leading zero
  })
})

describe('luhn / isCard', () => {
  it('accepts known-valid test numbers', () => {
    expect(luhn('4111111111111111')).toBe(true)
    expect(isCard('4111 1111 1111 1111')).toBe(true)
    expect(isCard('5500-0000-0000-0004')).toBe(true)
  })
  it('rejects a number that fails the checksum', () => {
    expect(isCard('4111111111111112')).toBe(false)
  })
  it('rejects non-card lengths', () => {
    expect(isCard('411111')).toBe(false)
  })
})

describe('isPhone', () => {
  it('accepts Indonesian mobile formats', () => {
    expect(isPhone('081234567890')).toBe(true)
    expect(isPhone('+628123456789')).toBe(true)
    expect(isPhone('0812-3456-7890')).toBe(true)
  })
  it('accepts international E.164', () => {
    expect(isPhone('+14155552671')).toBe(true)
  })
  it('rejects years and short numbers', () => {
    expect(isPhone('2024')).toBe(false)
    expect(isPhone('12345')).toBe(false)
  })
})

describe('isNpwp', () => {
  it('accepts 15 and 16 digit forms', () => {
    expect(isNpwp('091234567890123')).toBe(true)
    expect(isNpwp('0912345678901234')).toBe(true)
  })
  it('rejects other lengths', () => {
    expect(isNpwp('12345')).toBe(false)
  })
})

describe('isDate', () => {
  it('accepts Date objects and common strings', () => {
    expect(isDate(new Date('2020-01-01'))).toBe(true)
    expect(isDate('1990-01-25')).toBe(true)
    expect(isDate('25/01/1990')).toBe(true)
  })
  it('accepts Excel serial numbers in a plausible window', () => {
    expect(isDate(44000)).toBe(true)
  })
  it('rejects numbers outside that window', () => {
    expect(isDate(1_500_000)).toBe(false)
    expect(isDate(0)).toBe(false)
  })
  it('rejects free text', () => {
    expect(isDate('hello')).toBe(false)
  })
})

describe('isCurrency', () => {
  it('accepts numbers and formatted amounts', () => {
    expect(isCurrency(1500000)).toBe(true)
    expect(isCurrency('Rp 1.500.000')).toBe(true)
    expect(isCurrency('$1,200.50')).toBe(true)
  })
  it('rejects text', () => {
    expect(isCurrency('Budi')).toBe(false)
  })
})

describe('looksLikeName', () => {
  it('accepts capitalised two-to-four word names', () => {
    expect(looksLikeName('Budi Santoso')).toBe(true)
    expect(looksLikeName('Siti Nurul Rahayu')).toBe(true)
  })
  it('rejects single words, digits and sentences', () => {
    expect(looksLikeName('Budi')).toBe(false)
    expect(looksLikeName('Budi 123')).toBe(false)
    expect(looksLikeName('this is a long lowercase sentence')).toBe(false)
  })
})

describe('looksLikeAddress', () => {
  it('accepts Indonesian and English street forms', () => {
    expect(looksLikeAddress('Jl. Sudirman No. 45, Jakarta')).toBe(true)
    expect(looksLikeAddress('123 Main St, Springfield')).toBe(true)
  })
  it('rejects short strings', () => {
    expect(looksLikeAddress('Jakarta')).toBe(false)
  })
})
