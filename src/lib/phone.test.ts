import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone, phoneToParts, validateE164Phone } from './phone'

describe('international lead phone handling', () => {
  it('normalizes a country selection and local number to E.164', () => {
    expect(normalizePhone('PK', '0300 1234567').value).toBe('+923001234567')
  })

  it('keeps empty optional values blank and reports invalid numbers', () => {
    expect(normalizePhone('', '').value).toBe('')
    expect(validateE164Phone('+923001234567')).toBe(true)
    expect(validateE164Phone('+92123')).toBe(false)
  })

  it('splits stored numbers for editing and formats them for display', () => {
    expect(phoneToParts('+923001234567')).toMatchObject({ country: 'PK' })
    expect(formatPhone('+923001234567')).toContain('300')
  })
})
