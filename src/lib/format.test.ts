import { describe, expect, it } from 'vitest'
import { dateInputValue, formatDate, formatDateTime, formatMoney } from './format'

describe('display formatting', () => {
  it('handles empty and invalid dates without throwing', () => {
    expect(formatDate(null)).toBe('\u2014')
    expect(formatDate('not-a-date')).toBe('\u2014')
    expect(formatDateTime(null)).toBe('\u2014')
    expect(formatDateTime('not-a-date')).toBe('\u2014')
  })

  it('formats known currency and safely falls back for an invalid code', () => {
    expect(formatMoney(1250, 'USD')).toContain('1,250')
    expect(formatMoney(1250, 'INVALID')).toBe('INVALID 1,250')
    expect(formatMoney(Number.NaN, 'USD')).toBe('\u2014')
  })

  it('builds date-input values from local calendar fields', () => {
    expect(dateInputValue(new Date(2026, 0, 2, 23, 30))).toBe('2026-01-02')
  })
})
