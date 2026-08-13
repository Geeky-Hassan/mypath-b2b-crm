import Papa from 'papaparse'
import { strToU8, zip } from 'fflate'
import { leadReachedStage } from './metrics'
import { dateInputValue } from './format'
import type { LeadRecord, PipelineStage } from '../types/domain'

export type ExportStageMatch = 'current' | 'reached'

export interface LeadExportStageOptions {
  stage: PipelineStage | 'all'
  stageMatch: ExportStageMatch
}

const LEAD_EXPORT_COLUMNS = [
  'id',
  'company_name',
  'website',
  'country',
  'region',
  'customer_segment',
  'company_size',
  'education_offering',
  'current_lms_or_tools',
  'contact_name',
  'job_title',
  'email',
  'contact_phone',
  'linkedin_url',
  'decision_maker_status',
  'main_pain_point',
  'reason_mypath_is_relevant',
  'current_alternative',
  'budget_indicator',
  'qualification_score',
  'priority',
  'source',
  'owner_id',
  'owner_name',
  'owner_email',
  'created_by',
  'creator_name',
  'creator_email',
  'current_pipeline_stage',
  'lifecycle_status',
  'date_added',
  'first_contacted_at',
  'last_contacted_at',
  'next_action',
  'next_action_date',
  'demo_date',
  'proposed_value',
  'expected_close_date',
  'lost_reason',
  'notes',
  'created_at',
  'updated_at',
] as const

const ACTIVITY_EXPORT_COLUMNS = [
  'lead_id',
  'company_name',
  'activity_id',
  'activity_type',
  'activity_date',
  'summary',
  'notes',
  'created_by',
  'creator_name',
  'creator_email',
  'created_at',
] as const

const STAGE_HISTORY_EXPORT_COLUMNS = [
  'lead_id',
  'company_name',
  'history_id',
  'previous_stage',
  'new_stage',
  'description',
  'changed_by',
  'actor_name',
  'actor_email',
  'changed_at',
  'follow_up_required',
  'follow_up_date',
] as const

function csv(
  rows: Array<Record<string, string | number | boolean | null | undefined>>,
  columns: readonly string[],
): string {
  return Papa.unparse(
    {
      fields: [...columns],
      data: rows.map((row) => columns.map((column) => row[column])),
    },
    {
      newline: '\r\n',
      escapeFormulae: true,
    },
  )
}

export function filterLeadsForExport(
  leads: LeadRecord[],
  options: LeadExportStageOptions,
): LeadRecord[] {
  if (options.stage === 'all') return leads
  const stage = options.stage
  if (options.stageMatch === 'current') {
    return leads.filter((lead) => lead.current_pipeline_stage === stage)
  }
  return leads.filter((lead) => leadReachedStage(lead, stage))
}

export function buildLeadExportCsvs(leads: LeadRecord[]): {
  'leads.csv': string
  'activities.csv': string
  'stage-history.csv': string
} {
  const leadRows = leads.map((lead) => ({
    id: lead.id,
    company_name: lead.company_name,
    website: lead.website,
    country: lead.country,
    region: lead.region,
    customer_segment: lead.customer_segment,
    company_size: lead.company_size,
    education_offering: lead.education_offering,
    current_lms_or_tools: lead.current_lms_or_tools,
    contact_name: lead.contact_name,
    job_title: lead.job_title,
    email: lead.email,
    contact_phone: lead.contact_phone,
    linkedin_url: lead.linkedin_url,
    decision_maker_status: lead.decision_maker_status,
    main_pain_point: lead.main_pain_point,
    reason_mypath_is_relevant: lead.reason_mypath_is_relevant,
    current_alternative: lead.current_alternative,
    budget_indicator: lead.budget_indicator,
    qualification_score: lead.qualification_score,
    priority: lead.priority,
    source: lead.source,
    owner_id: lead.owner_id,
    owner_name: lead.owner?.full_name,
    owner_email: lead.owner?.email,
    created_by: lead.created_by,
    creator_name: lead.creator?.full_name,
    creator_email: lead.creator?.email,
    current_pipeline_stage: lead.current_pipeline_stage,
    lifecycle_status: lead.lifecycle_status,
    date_added: lead.date_added,
    first_contacted_at: lead.first_contacted_at,
    last_contacted_at: lead.last_contacted_at,
    next_action: lead.next_action,
    next_action_date: lead.next_action_date,
    demo_date: lead.demo_date,
    proposed_value: lead.proposed_value,
    expected_close_date: lead.expected_close_date,
    lost_reason: lead.lost_reason,
    notes: lead.notes,
    created_at: lead.created_at,
    updated_at: lead.updated_at,
  }))

  const activityRows = leads.flatMap((lead) =>
    (lead.activities ?? []).map((activity) => ({
      lead_id: lead.id,
      company_name: lead.company_name,
      activity_id: activity.id,
      activity_type: activity.activity_type,
      activity_date: activity.activity_date,
      summary: activity.summary,
      notes: activity.notes,
      created_by: activity.created_by,
      creator_name: activity.creator?.full_name,
      creator_email: activity.creator?.email,
      created_at: activity.created_at,
    })),
  )

  const historyRows = leads.flatMap((lead) =>
    (lead.stage_history ?? []).map((event) => ({
      lead_id: lead.id,
      company_name: lead.company_name,
      history_id: event.id,
      previous_stage: event.previous_stage,
      new_stage: event.new_stage,
      description: event.description,
      changed_by: event.changed_by,
      actor_name: event.actor?.full_name,
      actor_email: event.actor?.email,
      changed_at: event.changed_at,
      follow_up_required: event.follow_up_required,
      follow_up_date: event.follow_up_date,
    })),
  )

  return {
    'leads.csv': csv(leadRows, LEAD_EXPORT_COLUMNS),
    'activities.csv': csv(activityRows, ACTIVITY_EXPORT_COLUMNS),
    'stage-history.csv': csv(historyRows, STAGE_HISTORY_EXPORT_COLUMNS),
  }
}

export async function createLeadExportZip(leads: LeadRecord[]): Promise<Uint8Array> {
  const csvs = buildLeadExportCsvs(leads)
  const files = Object.fromEntries(
    Object.entries(csvs).map(([name, content]) => [name, strToU8(`\uFEFF${content}`)]),
  )

  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) reject(error)
      else resolve(data)
    })
  })
}

function downloadBytes(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([Uint8Array.from(bytes).buffer], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function downloadLeadExport(
  leads: LeadRecord[],
  date = dateInputValue(),
): Promise<void> {
  const archive = await createLeadExportZip(leads)
  downloadBytes(leadExportFilename(date), archive)
}

export function leadExportFilename(date = dateInputValue()): string {
  return `mypath-leads-export-${date}.zip`
}
