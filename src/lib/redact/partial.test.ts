import { describe, it, expect } from 'vitest'
import {
  maskEmail, maskPhone, maskCard, maskNik, maskNpwp, maskDate, maskName, maskAddress,
  maskGeneric, applyPartial,
} from './partial'

describe('maskEmail', () => {
  it('keeps the domain and the first character', () => {
    expect(maskEmail('budi.santoso@doku.com')).toBe('b***********@doku.com')
  })
  it('masks a single-character local part entirely', () => {
    expect(maskEmail('a@b.com')).toBe('*@b.com')
  })
  it('falls back to generic masking without an @', () => {
    expect(maskEmail('notanemail')).not.toContain('@')
  })
})

describe('maskPhone', () => {
  it('keeps the +62 country code and last four digits', () => {
    expect(maskPhone('+628123456789')).toBe('+6281****6789')
  })
  it('strips separators before masking', () => {
    expect(maskPhone('0812-3456-7890')).toBe('0812****7890')
  })
  it('masks a too-short number completely', () => {
    expect(maskPhone('12345')).toBe('*****')
  })
})

describe('maskCard', () => {
  it('follows the PCI display rule of first six, last four', () => {
    expect(maskCard('4111111111111111')).toBe('411111******1111')
  })
  it('handles spaced input', () => {
    expect(maskCard('4111 1111 1111 1111')).toBe('411111******1111')
  })
})

describe('maskNik', () => {
  it('keeps the four-digit region prefix and drops the birth date', () => {
    const masked = maskNik('3175012501900001')
    expect(masked).toBe('3175**********01')
    expect(masked).not.toContain('250190')
  })
  it('degrades gracefully on a wrong-length value', () => {
    expect(maskNik('123')).toBe('***')
  })
})

describe('maskNpwp', () => {
  it('keeps only the first two digits', () => {
    expect(maskNpwp('091234567890123')).toBe('09*************')
  })
})

describe('maskDate', () => {
  it('keeps the year from a Date', () => {
    expect(maskDate(new Date('1990-01-25T00:00:00Z'))).toBe('1990-**-**')
  })
  it('extracts a year from a string', () => {
    expect(maskDate('25/01/1990')).toBe('1990-**-**')
  })
  it('masks entirely when there is no year', () => {
    expect(maskDate('not a date')).toBe('*'.repeat('not a date'.length))
  })
})

describe('maskName', () => {
  it('keeps initials and word count', () => {
    expect(maskName('Budi Santoso')).toBe('B*** S******')
  })
  it('preserves the original spacing', () => {
    expect(maskName('Siti  Nurul')).toBe('S***  N****')
  })
})

describe('maskAddress', () => {
  it('removes digits but keeps the street', () => {
    expect(maskAddress('Jl. Sudirman No. 45')).toBe('Jl. Sudirman No. **')
  })
})

describe('maskGeneric', () => {
  it('never reveals more than half the value', () => {
    const out = maskGeneric('abcdefgh', 6, 6)
    expect(out.split('*').join('').length).toBeLessThanOrEqual(4)
  })
  it('fully masks values shorter than four characters', () => {
    expect(maskGeneric('abc', 2, 2)).toBe('***')
  })
})

describe('applyPartial', () => {
  it('leaves empty cells alone so "no data" stays distinct from "removed"', () => {
    expect(applyPartial(null, 'email')).toBeNull()
    expect(applyPartial('', 'email')).toBe('')
    expect(applyPartial(undefined, 'name')).toBeUndefined()
  })
  it('dispatches on the detected type', () => {
    expect(applyPartial('a.b@c.com', 'email')).toContain('@c.com')
    expect(applyPartial('Budi Santoso', 'name')).toBe('B*** S******')
  })
  it('masks currency whole, since a half-masked number is not a number', () => {
    expect(applyPartial(1500000, 'currency')).toBe('*******')
  })
  it('honours a custom mask character', () => {
    expect(applyPartial('Budi Santoso', 'name', { maskChar: '#' })).toBe('B### S######')
  })
})
