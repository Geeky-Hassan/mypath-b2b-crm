import { describe, expect, it } from 'vitest'
import {
  canArchiveLead,
  canManageDealFields,
  canManageTargets,
  canMoveLead,
  canPermanentlyDelete,
  isFounder,
} from './permissions'

describe('role permissions', () => {
  it('allows founder-only operations for the founder', () => {
    expect(isFounder('founder')).toBe(true)
    expect(canPermanentlyDelete('founder')).toBe(true)
    expect(canManageTargets('founder')).toBe(true)
    expect(canArchiveLead('founder')).toBe(true)
    expect(canManageDealFields('founder')).toBe(true)
    expect(canMoveLead('founder', 'demo_booked', 'negotiation')).toBe(true)
  })

  it('keeps founder controls restricted while allowing safeguarded lead deletion', () => {
    expect(isFounder('lead_generator')).toBe(false)
    expect(canPermanentlyDelete('lead_generator')).toBe(true)
    expect(canManageTargets('lead_generator')).toBe(false)
    expect(canArchiveLead('lead_generator')).toBe(false)
    expect(canManageDealFields('lead_generator')).toBe(false)
    expect(canPermanentlyDelete(undefined)).toBe(false)
  })

  it('lets a lead generator perform only the qualification stage transition', () => {
    expect(canMoveLead('lead_generator', 'lead_added', 'qualified')).toBe(true)
    expect(canMoveLead('lead_generator', 'qualified', 'contacted')).toBe(false)
    expect(canMoveLead('lead_generator', 'lead_added', 'contacted')).toBe(false)
    expect(canMoveLead(undefined, 'lead_added', 'qualified')).toBe(false)
  })
})
