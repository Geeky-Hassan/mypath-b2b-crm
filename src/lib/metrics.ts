import {
  FUNNEL_LABELS,
  FUNNEL_STAGES,
  PIPELINE_STAGES,
  STAGE_LABELS,
  STAGE_TO_FUNNEL,
  type FunnelStage,
  type LeadRecord,
  type PipelineStage,
  type Target,
  type TargetType,
} from '../types/domain'

const DAY_MS = 86_400_000

export interface BreakdownItem {
  name: string
  value: number
}

export interface ConversionMetric {
  from: PipelineStage
  to: PipelineStage
  eligible: number
  converted: number
  rate: number | null
}

export interface StageDurationMetric {
  stage: PipelineStage
  averageDays: number | null
  sampleSize: number
}

export interface TargetProgress {
  actual: number
  target: number
  percentage: number | null
}

function stageIndex(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage)
}

function sortedHistory(lead: LeadRecord) {
  return [...(lead.stage_history ?? [])].sort((a, b) =>
    a.changed_at.localeCompare(b.changed_at),
  )
}

function firstStageEvent(lead: LeadRecord, stage: PipelineStage) {
  return sortedHistory(lead).find((event) => event.new_stage === stage)
}

export function getLeadFunnelStage(lead: LeadRecord): FunnelStage {
  return STAGE_TO_FUNNEL[lead.current_pipeline_stage]
}

export function leadReachedStage(lead: LeadRecord, stage: PipelineStage): boolean {
  const highestStage = [
    lead.current_pipeline_stage,
    ...(lead.stage_history ?? []).map((event) => event.new_stage),
  ].reduce((highest, candidate) =>
    stageIndex(candidate) > stageIndex(highest) ? candidate : highest,
  )
  return stageIndex(highestStage) >= stageIndex(stage)
}

export function calculateFunnelCounts(leads: LeadRecord[]): BreakdownItem[] {
  return FUNNEL_STAGES.map((funnel) => ({
    name: FUNNEL_LABELS[funnel],
    value: leads.filter((lead) => getLeadFunnelStage(lead) === funnel).length,
  }))
}

export function calculateBreakdown(
  leads: LeadRecord[],
  selector: (lead: LeadRecord) => string | null | undefined,
): BreakdownItem[] {
  const counts = new Map<string, number>()
  for (const lead of leads) {
    const name = selector(lead)?.trim() || 'Not recorded'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

export function calculateConversionRates(leads: LeadRecord[]): ConversionMetric[] {
  return PIPELINE_STAGES.slice(0, -1).map((from, index) => {
    const to = PIPELINE_STAGES[index + 1]
    const candidates = leads.flatMap((lead) => {
      const fromEvent = firstStageEvent(lead, from)
      if (!fromEvent) return []
      return [{ lead, fromDate: new Date(fromEvent.changed_at).valueOf() }]
    })
    const converted = candidates.filter(({ lead, fromDate }) =>
      sortedHistory(lead).some(
        (event) =>
          event.new_stage === to && new Date(event.changed_at).valueOf() >= fromDate,
      ),
    ).length
    return {
      from,
      to,
      eligible: candidates.length,
      converted,
      rate: candidates.length ? (converted / candidates.length) * 100 : null,
    }
  })
}

export function calculateSalesCycleDays(leads: LeadRecord[]): number[] {
  return leads.flatMap((lead) => {
    const start = firstStageEvent(lead, 'lead_added')
    const wonEvents = sortedHistory(lead).filter((event) =>
      ['paid_pilot_won', 'recurring_contract_won'].includes(event.new_stage),
    )
    const won = wonEvents[0]
    if (!start || !won) return []
    const duration =
      (new Date(won.changed_at).valueOf() - new Date(start.changed_at).valueOf()) / DAY_MS
    return Number.isFinite(duration) && duration >= 0 ? [duration] : []
  })
}

export function average(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function calculateAverageTimeInStage(
  leads: LeadRecord[],
  now = new Date(),
): StageDurationMetric[] {
  const durations = new Map<PipelineStage, number[]>(
    PIPELINE_STAGES.map((stage) => [stage, []]),
  )
  for (const lead of leads) {
    const history = sortedHistory(lead)
    history.forEach((event, index) => {
      const next = history[index + 1]
      let end: Date | null = next ? new Date(next.changed_at) : null
      if (
        !end &&
        lead.current_pipeline_stage === event.new_stage &&
        ['active', 'nurture'].includes(lead.lifecycle_status)
      ) {
        end = now
      }
      if (!end) return
      const days = (end.valueOf() - new Date(event.changed_at).valueOf()) / DAY_MS
      if (Number.isFinite(days) && days >= 0) durations.get(event.new_stage)?.push(days)
    })
  }
  return PIPELINE_STAGES.map((stage) => {
    const values = durations.get(stage) ?? []
    return {
      stage,
      averageDays: average(values),
      sampleSize: values.length,
    }
  })
}

function dateInTarget(value: string, target: Target): boolean {
  const date = value.slice(0, 10)
  return date >= target.start_date && date <= target.end_date
}

const targetStage: Partial<Record<TargetType, PipelineStage>> = {
  qualified_leads: 'qualified',
  leads_contacted: 'contacted',
  replies: 'replied',
  discovery_calls_booked: 'discovery_call_booked',
  demos_booked: 'demo_booked',
  proposals_sent: 'paid_pilot_proposal_sent',
  paid_pilots_won: 'paid_pilot_won',
}

export function calculateTargetActual(target: Target, leads: LeadRecord[]): number {
  if (target.target_type === 'leads_added') {
    return leads.filter(
      (lead) =>
        lead.created_by === target.user_id && dateInTarget(lead.created_at, target),
    ).length
  }
  const stage = targetStage[target.target_type]
  if (!stage) return 0
  return leads.filter((lead) =>
    lead.stage_history?.some(
      (event) =>
        event.new_stage === stage &&
        event.changed_by === target.user_id &&
        dateInTarget(event.changed_at, target),
    ),
  ).length
}

export function calculateTargetProgress(
  target: Target,
  leads: LeadRecord[],
): TargetProgress {
  const actual = calculateTargetActual(target, leads)
  return {
    actual,
    target: target.target_value,
    percentage: target.target_value > 0 ? (actual / target.target_value) * 100 : null,
  }
}

export function calculateOverallPaidPilotConversion(leads: LeadRecord[]): number | null {
  if (!leads.length) return null
  const won = leads.filter((lead) => leadReachedStage(lead, 'paid_pilot_won')).length
  return (won / leads.length) * 100
}

export function calculateLostReasons(leads: LeadRecord[]): BreakdownItem[] {
  return calculateBreakdown(
    leads.filter((lead) => lead.lifecycle_status === 'lost'),
    (lead) => lead.lost_reason,
  )
}

export function calculateDropOffByStage(leads: LeadRecord[]): BreakdownItem[] {
  return calculateBreakdown(
    leads.filter((lead) => lead.lifecycle_status === 'lost'),
    (lead) => STAGE_LABELS[lead.current_pipeline_stage],
  )
}

export function missingLeadInformation(lead: LeadRecord): string[] {
  const missing: string[] = []
  if (!lead.website) missing.push('website')
  if (!lead.contact_name) missing.push('contact name')
  if (!lead.email) missing.push('contact email')
  if (!lead.country) missing.push('country')
  if (!lead.customer_segment) missing.push('segment')
  if (!lead.next_action) missing.push('next action')
  return missing
}

export function metricDisplay(value: number | null, suffix = ''): string {
  return value == null ? 'Not enough data' : `${value.toFixed(1)}${suffix}`
}
