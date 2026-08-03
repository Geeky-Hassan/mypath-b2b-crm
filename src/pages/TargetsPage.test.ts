import { describe, expect, it } from 'vitest'
import { targetSchema } from './TargetsPage'

const validTarget = {
  period_type: 'weekly' as const,
  start_date: '2026-08-03',
  end_date: '2026-08-09',
  target_type: 'leads_added' as const,
  target_value: '10',
}

describe('target validation', () => {
  it('accepts an exact seven-day weekly period', () => {
    expect(targetSchema.safeParse(validTarget).success).toBe(true)
  })

  it('rejects fractional targets and incorrectly sized weekly periods', () => {
    expect(targetSchema.safeParse({ ...validTarget, target_value: '1.5' }).success).toBe(
      false,
    )
    expect(
      targetSchema.safeParse({ ...validTarget, end_date: '2026-08-10' }).success,
    ).toBe(false)
  })

  it('accepts only a complete calendar month for monthly targets', () => {
    expect(
      targetSchema.safeParse({
        ...validTarget,
        period_type: 'monthly',
        start_date: '2026-02-01',
        end_date: '2026-02-28',
      }).success,
    ).toBe(true)
    expect(
      targetSchema.safeParse({
        ...validTarget,
        period_type: 'monthly',
        start_date: '2026-02-02',
        end_date: '2026-02-28',
      }).success,
    ).toBe(false)
  })
})
