import { describe, expect, it } from 'vitest'
import {
  leadFormSchema,
  leadGeneratorLeadFormSchema,
  type LeadFormValues,
} from './leadValidation'

const validLead: LeadFormValues = {
  company_name: 'Northstar Learning',
  website: 'https://northstar.example',
  country: 'United Kingdom',
  region: 'Europe',
  customer_segment: 'Training provider',
  company_size: '51-200',
  education_offering: 'Leadership programmes',
  current_lms_or_tools: 'Moodle',
  contact_name: 'Alex Morgan',
  job_title: 'Operations Director',
  email: 'alex@northstar.example',
  contact_phone_country: 'GB',
  contact_phone_national: '020 7946 0018',
  linkedin_url: 'https://linkedin.com/in/alex-morgan',
  decision_maker_status: 'Decision maker',
  main_pain_point: 'Fragmented learner journeys',
  reason_mypath_is_relevant: 'Needs guided learning paths',
  current_alternative: 'Spreadsheets',
  budget_indicator: '$10k-$25k',
  qualification_score: '9',
  priority: 'high',
  source: 'linkedin',
  owner_id: '11111111-1111-4111-8111-111111111111',
  current_pipeline_stage: 'qualified',
  lifecycle_status: 'active',
  date_added: '2026-08-03',
  first_contacted_at: '',
  last_contacted_at: '',
  next_action: 'Schedule discovery',
  next_action_date: '2026-08-10',
  demo_date: '',
  proposed_value: '18000',
  expected_close_date: '2026-09-30',
  lost_reason: '',
  notes: '',
}

describe('leadFormSchema', () => {
  it('accepts a complete valid lead', () => {
    expect(leadFormSchema.safeParse(validLead).success).toBe(true)
  })

  it('requires a company name', () => {
    const result = leadFormSchema.safeParse({ ...validLead, company_name: ' ' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['company_name'])
  })

  it('accepts whole-number qualification scores from 0 to 11', () => {
    expect(
      leadFormSchema.safeParse({ ...validLead, qualification_score: '0' }).success,
    ).toBe(true)
    expect(
      leadFormSchema.safeParse({ ...validLead, qualification_score: '11' }).success,
    ).toBe(true)
    expect(
      leadFormSchema.safeParse({ ...validLead, qualification_score: '-1' }).success,
    ).toBe(false)
    expect(
      leadFormSchema.safeParse({ ...validLead, qualification_score: '12' }).success,
    ).toBe(false)
    expect(
      leadFormSchema.safeParse({ ...validLead, qualification_score: '7.5' }).success,
    ).toBe(false)
  })

  it('accepts Google and AI as lead sources', () => {
    expect(leadFormSchema.safeParse({ ...validLead, source: 'google' }).success).toBe(
      true,
    )
    expect(leadFormSchema.safeParse({ ...validLead, source: 'ai' }).success).toBe(true)
  })

  it('requires a reason when a lead is lost', () => {
    const result = leadFormSchema.safeParse({
      ...validLead,
      current_pipeline_stage: 'qualified',
      lifecycle_status: 'lost',
      lost_reason: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'lost_reason')).toBe(
        true,
      )
    }
  })

  it('reports invalid calendar dates during form and CSV validation', () => {
    const result = leadFormSchema.safeParse({
      ...validLead,
      next_action_date: '2026-02-30',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === 'next_action_date'),
      ).toBe(true)
    }
  })

  it('requires a positive proposed value for commercial stages', () => {
    const result = leadFormSchema.safeParse({
      ...validLead,
      current_pipeline_stage: 'paid_pilot_proposal_sent',
      proposed_value: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === 'proposed_value'),
      ).toBe(true)
    }
  })

  it('accepts only HTTP and HTTPS website URLs', () => {
    expect(
      leadFormSchema.safeParse({ ...validLead, website: 'ftp://northstar.example' })
        .success,
    ).toBe(false)
    expect(
      leadFormSchema.safeParse({ ...validLead, website: 'https://northstar.example' })
        .success,
    ).toBe(true)
  })

  it('normalizes optional international phone input and rejects invalid numbers', () => {
    expect(
      leadFormSchema.safeParse({
        ...validLead,
        contact_phone_country: 'PK',
        contact_phone_national: '0300 1234567',
      }).success,
    ).toBe(true)
    expect(
      leadFormSchema.safeParse({
        ...validLead,
        contact_phone_country: 'PK',
        contact_phone_national: '123',
      }).success,
    ).toBe(false)
    expect(
      leadFormSchema.safeParse({
        ...validLead,
        contact_phone_country: 'PK',
        contact_phone_national: '',
      }).success,
    ).toBe(true)
  })

  it('validates shared lead-generator fields without hidden deal requirements', () => {
    expect(
      leadGeneratorLeadFormSchema.safeParse({
        ...validLead,
        current_pipeline_stage: 'paid_pilot_proposal_sent',
        proposed_value: '',
      }).success,
    ).toBe(true)
  })
})
