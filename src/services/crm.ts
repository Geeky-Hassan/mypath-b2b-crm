import { getSupabase } from '../lib/supabase'
import { toSupabaseRequestError, withSessionRecovery } from '../auth/sessionRecovery'
import {
  READY_FOR_FOUNDER_COLUMNS,
  READY_FOR_FOUNDER_TEXT_COLUMNS,
} from '../lib/leadReadiness'
import { CrmAccessUnavailableError } from '../lib/crmErrors'
import { TARGET_TYPES } from '../types/domain'
import type {
  ActivityType,
  CrmSettings,
  CrmTask,
  LeadActivity,
  LeadFilters,
  LeadInput,
  LeadRecord,
  PaginatedLeads,
  PipelineStage,
  Profile,
  SalesCostPeriod,
  StageHistory,
  TaskInput,
  TaskStatus,
  Target,
  TargetPeriodType,
  TargetType,
} from '../types/domain'

export const DEFAULT_LEAD_FILTERS: LeadFilters = {
  search: '',
  stage: 'all',
  lifecycle: 'all',
  country: '',
  segment: '',
  source: 'all',
  ownerId: '',
  creatorId: '',
  readiness: 'all',
  priority: 'all',
  sortBy: 'updated_at',
  sortDirection: 'desc',
  page: 1,
  pageSize: 25,
}

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function leadPayload(input: LeadInput, includeFounderFields = true) {
  const shared = {
    company_name: input.company_name.trim(),
    website: optional(input.website),
    country: optional(input.country),
    region: optional(input.region),
    customer_segment: optional(input.customer_segment),
    company_size: optional(input.company_size),
    education_offering: optional(input.education_offering),
    current_lms_or_tools: optional(input.current_lms_or_tools),
    contact_name: optional(input.contact_name),
    job_title: optional(input.job_title),
    email: optional(input.email)?.toLowerCase() ?? null,
    contact_phone: optional(input.contact_phone),
    linkedin_url: optional(input.linkedin_url),
    decision_maker_status: optional(input.decision_maker_status),
    main_pain_point: optional(input.main_pain_point),
    reason_mypath_is_relevant: optional(input.reason_mypath_is_relevant),
    current_alternative: optional(input.current_alternative),
    budget_indicator: optional(input.budget_indicator),
    qualification_score: input.qualification_score ?? null,
    priority: input.priority,
    source: input.source,
    owner_id: input.owner_id,
    date_added: input.date_added,
    next_action: optional(input.next_action),
    next_action_date: optional(input.next_action_date),
    notes: optional(input.notes),
  }
  if (!includeFounderFields) return shared
  return {
    ...shared,
    current_pipeline_stage: input.current_pipeline_stage,
    lifecycle_status: input.lifecycle_status,
    first_contacted_at: input.first_contacted_at ?? null,
    last_contacted_at: input.last_contacted_at ?? null,
    demo_date: input.demo_date ?? null,
    proposed_value: input.proposed_value ?? null,
    expected_close_date: optional(input.expected_close_date),
    lost_reason: optional(input.lost_reason),
  }
}

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function normalizeLead(row: unknown): LeadRecord {
  const raw = row as LeadRecord & {
    owner?: LeadRecord['owner'] | LeadRecord['owner'][]
    creator?: LeadRecord['creator'] | LeadRecord['creator'][]
  }
  return {
    ...raw,
    owner: unwrapOne(raw.owner),
    creator: unwrapOne(raw.creator),
    activities: [...(raw.activities ?? [])].sort((a, b) =>
      b.activity_date.localeCompare(a.activity_date),
    ),
    stage_history: [...(raw.stage_history ?? [])].sort((a, b) =>
      b.changed_at.localeCompare(a.changed_at),
    ),
  }
}

function cleanSearch(value: string): string {
  return value.replace(/[,%()]/g, ' ').trim()
}

export async function getProfiles(): Promise<Profile[]> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .in('account_status', ['active', 'disabled'])
    .order('full_name')
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function getLeadsPage(filters: LeadFilters): Promise<PaginatedLeads> {
  let query = getSupabase().from('crm_leads').select('*', { count: 'exact' })
  const search = cleanSearch(filters.search)
  if (search) {
    query = query.or(
      `company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%,contact_phone.ilike.%${search}%,website.ilike.%${search}%`,
    )
  }
  if (filters.stage !== 'all') query = query.eq('current_pipeline_stage', filters.stage)
  if (filters.lifecycle !== 'all') query = query.eq('lifecycle_status', filters.lifecycle)
  if (filters.country.trim())
    query = query.ilike('country', `%${filters.country.trim()}%`)
  if (filters.segment.trim()) {
    query = query.ilike('customer_segment', `%${filters.segment.trim()}%`)
  }
  if (filters.source !== 'all') query = query.eq('source', filters.source)
  if (filters.ownerId) query = query.eq('owner_id', filters.ownerId)
  if (filters.creatorId) query = query.eq('created_by', filters.creatorId)
  if (filters.readiness === 'missing') {
    const filters = READY_FOR_FOUNDER_COLUMNS.flatMap((column) =>
      READY_FOR_FOUNDER_TEXT_COLUMNS.includes(
        column as (typeof READY_FOR_FOUNDER_TEXT_COLUMNS)[number],
      )
        ? [`${column}.is.null`, `${column}.eq.`]
        : [`${column}.is.null`],
    )
    query = query.or(filters.join(','))
  }
  if (filters.readiness === 'ready') {
    for (const column of READY_FOR_FOUNDER_COLUMNS) {
      query = query.not(column, 'is', null)
      if (
        READY_FOR_FOUNDER_TEXT_COLUMNS.includes(
          column as (typeof READY_FOR_FOUNDER_TEXT_COLUMNS)[number],
        )
      ) {
        query = query.neq(column, '')
      }
    }
  }
  if (filters.priority !== 'all') query = query.eq('priority', filters.priority)

  const from = (filters.page - 1) * filters.pageSize
  const to = from + filters.pageSize - 1
  const { data, error, count } = await query
    .order(filters.sortBy, {
      ascending: filters.sortDirection === 'asc',
      nullsFirst: false,
    })
    .range(from, to)
  if (error) throw error
  return { leads: (data ?? []).map(normalizeLead), count: count ?? 0 }
}

export async function getAllLeads(
  overrides: Partial<LeadFilters> = {},
): Promise<LeadRecord[]> {
  const pageSize = 500
  const all: LeadRecord[] = []
  let page = 1
  let total: number
  do {
    const result = await getLeadsPage({
      ...DEFAULT_LEAD_FILTERS,
      ...overrides,
      page,
      pageSize,
    })
    all.push(...result.leads)
    total = result.count
    page += 1
    if (!result.leads.length) break
  } while (all.length < total)
  return all
}

export async function getLeadDuplicateCandidates(): Promise<
  Array<Pick<LeadRecord, 'id' | 'company_name' | 'website' | 'email'>>
> {
  const pageSize = 1000
  const candidates: Array<Pick<LeadRecord, 'id' | 'company_name' | 'website' | 'email'>> =
    []
  let offset = 0
  while (true) {
    const { data } = await withSessionRecovery(async () => {
      const result = await getSupabase()
        .from('crm_leads')
        .select('id, company_name, website, email')
        .order('id')
        .range(offset, offset + pageSize - 1)
      if (result.error) throw toSupabaseRequestError(result.error, result.status)
      return result
    })
    const page = (data ?? []) as Array<
      Pick<LeadRecord, 'id' | 'company_name' | 'website' | 'email'>
    >
    candidates.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }
  return candidates
}

export async function saveLead(
  input: LeadInput,
  currentUserId: string,
  leadId?: string,
  isFounder = false,
): Promise<string> {
  const payload = leadPayload(input, isFounder)

  if (leadId) {
    return withSessionRecovery(async () => {
      const result = await getSupabase()
        .from('leads')
        .update(payload, { count: 'exact' })
        .eq('id', leadId)
      if (result.error) throw toSupabaseRequestError(result.error, result.status)
      if (result.count !== 1) {
        throw new CrmAccessUnavailableError()
      }
      return leadId
    })
  }

  return withSessionRecovery(async () => {
    const result = await getSupabase()
      .from('leads')
      .insert({ ...payload, created_by: currentUserId })
      .select('id')
      .single()
    if (result.error) throw toSupabaseRequestError(result.error, result.status)
    return (result.data as { id: string }).id
  })
}

export async function addActivity(
  leadId: string,
  values: {
    activity_type: ActivityType
    activity_date: string
    summary: string
    notes?: string
  },
  userId: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from('lead_activities')
    .insert({
      lead_id: leadId,
      activity_type: values.activity_type,
      activity_date: values.activity_date,
      summary: values.summary.trim(),
      notes: optional(values.notes),
      created_by: userId,
    })
  if (error) throw error
}

export async function deleteActivity(activityId: string): Promise<void> {
  const { error, count } = await getSupabase()
    .from('lead_activities')
    .delete({ count: 'exact' })
    .eq('id', activityId)
  if (error) throw error
  if (count !== 1)
    throw new Error('The activity was not deleted or is no longer editable.')
}

export async function moveLeadStage(
  leadId: string,
  stage: PipelineStage,
  details: {
    proposedValue?: number
    description: string
    followUpRequired: boolean
    followUpDate?: string
  },
): Promise<void> {
  const { error } = await getSupabase().rpc('move_lead_with_context', {
    p_lead_id: leadId,
    p_new_stage: stage,
    p_proposed_value: details.proposedValue ?? null,
    p_description: details.description.trim(),
    p_follow_up_required: details.followUpRequired,
    p_follow_up_date: details.followUpRequired ? (details.followUpDate ?? null) : null,
  })
  if (error) throw error
}

export async function markLeadLost(leadId: string, lostReason: string): Promise<void> {
  const { error, count } = await getSupabase()
    .from('leads')
    .update(
      { lifecycle_status: 'lost', lost_reason: lostReason.trim() },
      { count: 'exact' },
    )
    .eq('id', leadId)
  if (error) throw error
  if (count !== 1) throw new Error('The lead was not marked lost. Refresh and try again.')
}

export async function setLeadArchived(leadId: string, archived: boolean): Promise<void> {
  const { error, count } = await getSupabase()
    .from('leads')
    .update({ lifecycle_status: archived ? 'archived' : 'active' }, { count: 'exact' })
    .eq('id', leadId)
  if (error) throw error
  if (count !== 1) {
    throw new Error(
      archived
        ? 'The lead was not archived. Check that it still exists and that your CRM access is active.'
        : 'The lead was not restored. Check that it still exists and that your CRM access is active.',
    )
  }
}

export async function permanentlyDeleteLead(
  leadId: string,
  expectedCompanyName: string,
): Promise<void> {
  const { data, error } = await getSupabase().rpc('delete_archived_lead', {
    p_lead_id: leadId,
    p_expected_company_name: expectedCompanyName,
  })
  if (error) throw error
  if (data !== 1) {
    throw new Error(
      'The lead was not deleted. It must be archived and the company name must match.',
    )
  }
}

export async function getTargets(
  startDate?: string,
  endDate?: string,
): Promise<Target[]> {
  let query = getSupabase()
    .from('targets')
    .select('*, user:profiles!targets_user_id_fkey(id, full_name, email, role)')
    .in('target_type', [...TARGET_TYPES])
    .order('start_date', { ascending: false })
  if (startDate) query = query.gte('end_date', startDate)
  if (endDate) query = query.lte('start_date', endDate)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => {
    const target = row as unknown as Target & { user?: Target['user'] | Target['user'][] }
    return { ...target, user: unwrapOne(target.user) }
  })
}

function normalizeTask(row: unknown): CrmTask {
  const raw = row as CrmTask & {
    assignee?: CrmTask['assignee'] | CrmTask['assignee'][]
    assigner?: CrmTask['assigner'] | CrmTask['assigner'][]
    lead?: CrmTask['lead'] | CrmTask['lead'][]
  }
  return {
    ...raw,
    assignee: unwrapOne(raw.assignee),
    assigner: unwrapOne(raw.assigner),
    lead: unwrapOne(raw.lead),
    events: [...(raw.events ?? [])].sort((left, right) =>
      right.changed_at.localeCompare(left.changed_at),
    ),
  }
}

export async function getTasks(): Promise<CrmTask[]> {
  const { data, error } = await getSupabase()
    .from('crm_tasks')
    .select(
      `*,
       assignee:profiles!crm_tasks_assigned_to_fkey(id, full_name, email, role, account_status),
       assigner:profiles!crm_tasks_assigned_by_fkey(id, full_name, email, role),
       lead:leads!crm_tasks_lead_id_fkey(id, company_name),
       events:task_events(*, actor:profiles!task_events_changed_by_fkey(id, full_name, email, role))`,
    )
    .order('due_date')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(normalizeTask)
}

export async function saveTask(values: TaskInput, taskId?: string): Promise<void> {
  const payload = {
    title: values.title.trim(),
    description: optional(values.description),
    task_type: values.task_type,
    lead_id: optional(values.lead_id),
    assigned_to: values.assigned_to,
    assigned_by: values.assigned_by,
    priority: values.priority,
    status: values.status,
    due_date: values.due_date,
    completion_note: optional(values.completion_note),
  }
  if (taskId) {
    const { error, count } = await getSupabase()
      .from('crm_tasks')
      .update(payload, { count: 'exact' })
      .eq('id', taskId)
    if (error) throw error
    if (count !== 1) throw new Error('The task was not updated. Refresh and try again.')
    return
  }

  const { error } = await getSupabase().from('crm_tasks').insert(payload)
  if (error) throw error
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  completionNote?: string,
): Promise<void> {
  const { error, count } = await getSupabase()
    .from('crm_tasks')
    .update({ status, completion_note: optional(completionNote) }, { count: 'exact' })
    .eq('id', taskId)
  if (error) throw error
  if (count !== 1) throw new Error('The task was not updated. Check your assignment.')
}

export async function deleteTask(taskId: string): Promise<void> {
  const { data, error } = await getSupabase().rpc('delete_crm_task', {
    p_task_id: taskId,
  })
  if (error) throw error
  if (data !== 1) throw new Error('The task was not deleted or was already removed.')
}

export async function updateProfileWorkDetails(
  profileId: string,
  values: { full_name: string; job_title?: string; responsibilities?: string },
): Promise<void> {
  const { error, count } = await getSupabase()
    .from('profiles')
    .update(
      {
        full_name: values.full_name.trim(),
        job_title: optional(values.job_title),
        responsibilities: optional(values.responsibilities),
      },
      { count: 'exact' },
    )
    .eq('id', profileId)
  if (error) throw error
  if (count !== 1) throw new Error('The work profile was not updated.')
}

export type TeamAdminRequest =
  | {
      action: 'create_lead_generator'
      email: string
      password: string
      full_name: string
      job_title?: string
      responsibilities?: string
    }
  | { action: 'reset_password'; user_id: string; password: string }
  | {
      action: 'set_account_status'
      user_id: string
      account_status: 'active' | 'disabled'
    }
  | { action: 'delete_lead_generator'; user_id: string }
  | { action: 'change_own_password'; password: string }

export async function runTeamAdminAction(
  request: TeamAdminRequest,
): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase().functions.invoke('team-admin', {
    body: request,
  })
  if (error) {
    let message = error.message || 'The account action failed.'
    const context = 'context' in error ? error.context : null
    if (context instanceof Response) {
      try {
        const body = (await context.clone().json()) as { error?: unknown }
        if (typeof body.error === 'string') message = body.error
      } catch {
        // Keep the safe Supabase client message when the response is not JSON.
      }
    }
    throw new Error(message)
  }
  const response = (data ?? {}) as Record<string, unknown>
  if (typeof response.error === 'string') throw new Error(response.error)
  return response
}

export async function saveTarget(values: {
  id?: string
  user_id: string
  period_type: TargetPeriodType
  start_date: string
  end_date: string
  target_type: TargetType
  target_value: number
}): Promise<void> {
  const payload = {
    user_id: values.user_id,
    period_type: values.period_type,
    start_date: values.start_date,
    end_date: values.end_date,
    target_type: values.target_type.trim(),
    target_value: values.target_value,
  }
  if (values.id) {
    const { error, count } = await getSupabase()
      .from('targets')
      .update(payload, { count: 'exact' })
      .eq('id', values.id)
    if (error) throw error
    if (count !== 1) throw new Error('The target was not updated.')
    return
  }

  const { error } = await getSupabase().from('targets').insert(payload)
  if (error) throw error
}

export async function getSalesCostPeriod(
  periodStart: string,
  periodEnd: string,
): Promise<SalesCostPeriod | null> {
  const { data, error } = await getSupabase()
    .from('sales_costs')
    .select('*')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle()
  if (error) throw error
  return data as SalesCostPeriod | null
}

export async function saveSalesCostPeriod(values: {
  id?: string
  period_start: string
  period_end: string
  sales_cost: number
  notes?: string
  created_by: string
}): Promise<void> {
  const payload = {
    period_start: values.period_start,
    period_end: values.period_end,
    sales_cost: values.sales_cost,
    notes: optional(values.notes),
    created_by: values.created_by,
  }
  if (values.id) {
    const { error, count } = await getSupabase()
      .from('sales_costs')
      .update(payload, { count: 'exact' })
      .eq('id', values.id)
    if (error) throw error
    if (count !== 1) throw new Error('The sales-cost period was not updated.')
    return
  }

  const { error } = await getSupabase().from('sales_costs').insert(payload)
  if (error) throw error
}

export async function deleteTarget(targetId: string): Promise<void> {
  const { error, count } = await getSupabase()
    .from('targets')
    .delete({ count: 'exact' })
    .eq('id', targetId)
  if (error) throw error
  if (count !== 1) throw new Error('The target was not deleted.')
}

export async function getSettings(): Promise<CrmSettings> {
  const { data, error } = await getSupabase().from('crm_settings').select('*').single()
  if (error) throw error
  return data as CrmSettings
}

export async function saveSettings(
  organizationName: string,
  defaultCurrency: string,
  userId: string,
): Promise<void> {
  const { error, count } = await getSupabase()
    .from('crm_settings')
    .update(
      {
        organization_name: organizationName.trim(),
        default_currency: defaultCurrency.trim().toUpperCase(),
        updated_by: userId,
      },
      { count: 'exact' },
    )
    .eq('id', true)
  if (error) throw error
  if (count !== 1) throw new Error('CRM settings were not updated.')
}

export async function importLeadRows(
  inputs: LeadInput[],
  currentUserId: string,
  isFounder = true,
): Promise<number> {
  if (!inputs.length) return 0
  const payloads = inputs.map((input) => ({
    ...leadPayload(input, isFounder),
    created_by: currentUserId,
  }))
  const { error, count } = await getSupabase()
    .from('leads')
    .insert(payloads, { count: 'exact' })
  if (error) {
    throw new Error(`No rows were imported: ${error.message}`, { cause: error })
  }
  if (count !== payloads.length) {
    throw new Error('No rows were imported: the database did not confirm the full batch.')
  }
  return payloads.length
}

export type { LeadActivity, StageHistory }
