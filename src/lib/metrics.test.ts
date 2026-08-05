import { describe, expect, it } from 'vitest'
import {
  calculateAverageTimeInStage,
  calculateConversionRates,
  calculateFunnelCounts,
  calculateOverallPaidPilotConversion,
  calculateSalesCycleDays,
  calculateTargetProgress,
  getLeadFunnelStage,
} from './metrics'
import {
  PIPELINE_STAGES,
  STAGE_TO_FUNNEL,
  type LeadRecord,
  type PipelineStage,
  type StageHistory,
  type Target,
} from '../types/domain'
import { missingLeadInformation } from './leadReadiness'

const USER_ID = '11111111-1111-4111-8111-111111111111'

function history(
  leadId: string,
  stages: Array<{ stage: PipelineStage; at: string; by?: string }>,
): StageHistory[] {
  return stages.map((item, index) => ({
    id: `${leadId}-history-${index}`,
    lead_id: leadId,
    previous_stage: index ? stages[index - 1].stage : null,
    new_stage: item.stage,
    changed_by: item.by ?? USER_ID,
    changed_at: item.at,
    description: null,
    follow_up_required: false,
    follow_up_date: null,
  }))
}

function lead(
  id: string,
  stage: PipelineStage,
  stageHistory: StageHistory[] = [],
  overrides: Partial<LeadRecord> = {},
): LeadRecord {
  return {
    id,
    company_name: `Company ${id}`,
    website: null,
    country: null,
    region: null,
    customer_segment: null,
    company_size: null,
    education_offering: null,
    current_lms_or_tools: null,
    contact_name: null,
    job_title: null,
    email: null,
    contact_phone: null,
    linkedin_url: null,
    decision_maker_status: null,
    main_pain_point: null,
    reason_mypath_is_relevant: null,
    current_alternative: null,
    budget_indicator: null,
    qualification_score: null,
    priority: 'medium',
    source: 'other',
    owner_id: USER_ID,
    created_by: USER_ID,
    current_pipeline_stage: stage,
    lifecycle_status: 'active',
    date_added: '2026-01-01',
    first_contacted_at: null,
    last_contacted_at: null,
    next_action: null,
    next_action_date: null,
    demo_date: null,
    proposed_value: null,
    expected_close_date: null,
    lost_reason: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    activities: [],
    stage_history: stageHistory,
    ...overrides,
  }
}

describe('sales funnel stage mapping', () => {
  it('maps every detailed pipeline stage to the expected macro funnel', () => {
    expect(PIPELINE_STAGES.every((stage) => Boolean(STAGE_TO_FUNNEL[stage]))).toBe(true)
    expect(STAGE_TO_FUNNEL.lead_added).toBe('awareness')
    expect(STAGE_TO_FUNNEL.replied).toBe('interest')
    expect(STAGE_TO_FUNNEL.demo_completed).toBe('consideration')
    expect(STAGE_TO_FUNNEL.negotiation).toBe('decision')
    expect(STAGE_TO_FUNNEL.recurring_contract_won).toBe('action_retention')
  })

  it('counts leads by their current macro funnel stage', () => {
    const leads = [
      lead('a', 'lead_added'),
      lead('b', 'contacted'),
      lead('c', 'replied'),
      lead('d', 'demo_booked'),
      lead('e', 'paid_pilot_won'),
    ]
    expect(getLeadFunnelStage(leads[3])).toBe('consideration')
    expect(calculateFunnelCounts(leads).map((item) => item.value)).toEqual([
      2, 1, 1, 0, 1,
    ])
  })
})

describe('conversion and sales-cycle calculations', () => {
  const converted = lead(
    'converted',
    'contacted',
    history('converted', [
      { stage: 'lead_added', at: '2026-01-01T00:00:00Z' },
      { stage: 'qualified', at: '2026-01-03T00:00:00Z' },
      { stage: 'contacted', at: '2026-01-05T00:00:00Z' },
    ]),
  )
  const stopped = lead(
    'stopped',
    'lead_added',
    history('stopped', [{ stage: 'lead_added', at: '2026-01-02T00:00:00Z' }]),
  )

  it('uses recorded stage-history events for stage-to-stage conversion', () => {
    const conversions = calculateConversionRates([converted, stopped])
    expect(conversions[0]).toMatchObject({ eligible: 2, converted: 1, rate: 50 })
    expect(conversions[1]).toMatchObject({ eligible: 1, converted: 1, rate: 100 })
    expect(conversions[2]).toMatchObject({ eligible: 1, converted: 0, rate: 0 })
  })

  it('calculates completed sales cycles and excludes incomplete histories', () => {
    const won = lead(
      'won',
      'paid_pilot_won',
      history('won', [
        { stage: 'lead_added', at: '2026-01-01T00:00:00Z' },
        { stage: 'paid_pilot_won', at: '2026-01-11T00:00:00Z' },
      ]),
      { lifecycle_status: 'won', proposed_value: 1000 },
    )
    expect(calculateSalesCycleDays([won, stopped])).toEqual([10])
    expect(calculateOverallPaidPilotConversion([won, stopped])).toBe(50)
  })

  it('calculates time in stage from consecutive history events', () => {
    const durations = calculateAverageTimeInStage(
      [converted],
      new Date('2026-01-07T00:00:00Z'),
    )
    expect(durations.find((item) => item.stage === 'lead_added')).toMatchObject({
      averageDays: 2,
      sampleSize: 1,
    })
    expect(durations.find((item) => item.stage === 'qualified')).toMatchObject({
      averageDays: 2,
      sampleSize: 1,
    })
  })
})

describe('target progress', () => {
  it('counts distinct qualifying stage events by actor and date range', () => {
    const target: Target = {
      id: 'target-1',
      user_id: USER_ID,
      period_type: 'weekly',
      start_date: '2026-01-01',
      end_date: '2026-01-07',
      target_type: 'qualified_leads',
      target_value: 4,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const qualified = lead(
      'qualified',
      'qualified',
      history('qualified', [
        { stage: 'lead_added', at: '2026-01-01T00:00:00Z' },
        { stage: 'qualified', at: '2026-01-04T00:00:00Z' },
      ]),
    )
    const outsidePeriod = lead(
      'outside',
      'qualified',
      history('outside', [
        { stage: 'lead_added', at: '2026-01-01T00:00:00Z' },
        { stage: 'qualified', at: '2026-01-09T00:00:00Z' },
      ]),
    )
    expect(calculateTargetProgress(target, [qualified, outsidePeriod])).toEqual({
      actual: 1,
      target: 4,
      percentage: 25,
    })
  })
})

describe('Ready for Founder', () => {
  const readyFields: Partial<LeadRecord> = {
    website: 'https://ready.example',
    country: 'Pakistan',
    customer_segment: 'Training provider',
    contact_name: 'Alex Morgan',
    email: 'alex@ready.example',
    main_pain_point: 'Research is fragmented',
    reason_mypath_is_relevant: 'MyPath consolidates the workflow',
    qualification_score: 0,
    next_action: 'Founder review',
  }

  it('treats score zero as complete', () => {
    expect(missingLeadInformation(lead('ready', 'lead_added', [], readyFields))).toEqual(
      [],
    )
  })

  it('reports every missing readiness field consistently', () => {
    expect(missingLeadInformation(lead('missing', 'lead_added'))).toEqual([
      'website',
      'country',
      'customer segment',
      'contact name',
      'contact email',
      'main pain point',
      'why MyPath is relevant',
      'qualification score',
      'next action',
    ])
  })
})
