export const PIPELINE_STAGES = [
  'lead_added',
  'qualified',
  'contacted',
  'replied',
  'initial_discussion',
  'follow_up_required',
  'discovery_call_booked',
  'discovery_call_completed',
  'demo_booked',
  'demo_completed',
  'paid_pilot_proposal_sent',
  'negotiation',
  'paid_pilot_won',
  'recurring_contract_won',
] as const

export const FUNNEL_STAGES = [
  'awareness',
  'interest',
  'consideration',
  'decision',
  'action_retention',
] as const

export const LIFECYCLE_STATUSES = [
  'active',
  'nurture',
  'won',
  'lost',
  'archived',
] as const

export const LEAD_PRIORITIES = ['low', 'medium', 'high'] as const
export const LEAD_SOURCES = [
  'email',
  'linkedin',
  'google',
  'ai',
  'referral',
  'event',
  'other',
] as const
export const ACTIVITY_TYPES = [
  'note',
  'email',
  'linkedin',
  'call',
  'meeting',
  'demo',
  'other',
] as const
export const TARGET_PERIOD_TYPES = ['weekly', 'monthly'] as const
export const ACCOUNT_STATUSES = ['active', 'disabled', 'removed'] as const
export const TASK_STATUSES = ['todo', 'in_progress', 'completed', 'cancelled'] as const
export const TASK_TYPES = [
  'research',
  'data_enrichment',
  'qualification',
  'outreach_preparation',
  'follow_up',
  'administrative',
  'other',
] as const
export const TARGET_TYPES = [
  'leads_added',
  'qualified_leads',
  'leads_contacted',
  'replies',
  'discovery_calls_booked',
  'demos_booked',
  'proposals_sent',
  'paid_pilots_won',
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]
export type FunnelStage = (typeof FUNNEL_STAGES)[number]
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]
export type LeadPriority = (typeof LEAD_PRIORITIES)[number]
export type LeadSource = (typeof LEAD_SOURCES)[number]
export type ActivityType = (typeof ACTIVITY_TYPES)[number]
export type TargetPeriodType = (typeof TARGET_PERIOD_TYPES)[number]
export type TargetType = (typeof TARGET_TYPES)[number]
export type UserRole = 'founder' | 'lead_generator'
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskType = (typeof TASK_TYPES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  google: 'Google',
  ai: 'AI',
  referral: 'Referral',
  event: 'Event',
  other: 'Other',
}

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  job_title: string | null
  responsibilities: string | null
  account_status: AccountStatus
  must_change_password: boolean
  removed_at: string | null
  removed_by: string | null
  created_at: string
  updated_at: string
}

export interface LeadActivity {
  id: string
  lead_id: string
  activity_type: ActivityType
  activity_date: string
  summary: string
  notes: string | null
  created_by: string
  created_at: string
  creator?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null
}

export interface StageHistory {
  id: string
  lead_id: string
  previous_stage: PipelineStage | null
  new_stage: PipelineStage
  changed_by: string
  changed_at: string
  description: string | null
  follow_up_required: boolean
  follow_up_date: string | null
  actor?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null
}

export interface LeadRecord {
  id: string
  company_name: string
  website: string | null
  country: string | null
  region: string | null
  customer_segment: string | null
  company_size: string | null
  education_offering: string | null
  current_lms_or_tools: string | null
  contact_name: string | null
  job_title: string | null
  email: string | null
  contact_phone: string | null
  linkedin_url: string | null
  decision_maker_status: string | null
  main_pain_point: string | null
  reason_mypath_is_relevant: string | null
  current_alternative: string | null
  budget_indicator: string | null
  qualification_score: number | null
  priority: LeadPriority
  source: LeadSource
  owner_id: string
  created_by: string
  current_pipeline_stage: PipelineStage
  lifecycle_status: LifecycleStatus
  date_added: string
  first_contacted_at: string | null
  last_contacted_at: string | null
  next_action: string | null
  next_action_date: string | null
  demo_date: string | null
  proposed_value: number | null
  expected_close_date: string | null
  lost_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  owner?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null
  creator?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null
  activities?: LeadActivity[]
  stage_history?: StageHistory[]
}

export interface LeadInput {
  company_name: string
  website?: string
  country?: string
  region?: string
  customer_segment?: string
  company_size?: string
  education_offering?: string
  current_lms_or_tools?: string
  contact_name?: string
  job_title?: string
  email?: string
  contact_phone?: string
  linkedin_url?: string
  decision_maker_status?: string
  main_pain_point?: string
  reason_mypath_is_relevant?: string
  current_alternative?: string
  budget_indicator?: string
  qualification_score?: number
  priority: LeadPriority
  source: LeadSource
  owner_id: string
  current_pipeline_stage: PipelineStage
  lifecycle_status: LifecycleStatus
  date_added: string
  first_contacted_at?: string
  last_contacted_at?: string
  next_action?: string
  next_action_date?: string
  demo_date?: string
  proposed_value?: number
  expected_close_date?: string
  lost_reason?: string
  notes?: string
}

export interface Target {
  id: string
  user_id: string
  period_type: TargetPeriodType
  start_date: string
  end_date: string
  target_type: TargetType
  target_value: number
  created_at: string
  updated_at: string
  user?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null
}

export interface TaskEvent {
  id: string
  task_id: string
  event_type: 'created' | 'status_changed' | 'reassigned'
  previous_status: TaskStatus | null
  new_status: TaskStatus | null
  previous_assignee: string | null
  new_assignee: string | null
  note: string | null
  changed_by: string
  changed_at: string
  actor?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null
}

export interface CrmTask {
  id: string
  title: string
  description: string | null
  task_type: TaskType
  lead_id: string | null
  assigned_to: string
  assigned_by: string
  priority: LeadPriority
  status: TaskStatus
  due_date: string
  completion_note: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  assignee?: Pick<
    Profile,
    'id' | 'full_name' | 'email' | 'role' | 'account_status'
  > | null
  assigner?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> | null
  lead?: Pick<LeadRecord, 'id' | 'company_name'> | null
  events?: TaskEvent[]
}

export interface TaskInput {
  title: string
  description?: string
  task_type: TaskType
  lead_id?: string
  assigned_to: string
  assigned_by: string
  priority: LeadPriority
  status: TaskStatus
  due_date: string
  completion_note?: string
}

export interface SalesCostPeriod {
  id: string
  period_start: string
  period_end: string
  sales_cost: number
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface CrmSettings {
  id: boolean
  organization_name: string
  default_currency: string
  updated_at: string
  updated_by: string | null
}

export type LeadSortField =
  | 'company_name'
  | 'date_added'
  | 'updated_at'
  | 'qualification_score'
  | 'next_action_date'
  | 'proposed_value'

export interface LeadFilters {
  search: string
  stage: PipelineStage | 'all'
  lifecycle: LifecycleStatus | 'all'
  country: string
  segment: string
  source: LeadSource | 'all'
  ownerId: string
  creatorId: string
  readiness: 'all' | 'ready' | 'missing'
  priority: LeadPriority | 'all'
  sortBy: LeadSortField
  sortDirection: 'asc' | 'desc'
  page: number
  pageSize: number
}

export interface PaginatedLeads {
  leads: LeadRecord[]
  count: number
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  lead_added: 'Lead Added',
  qualified: 'Qualified',
  contacted: 'Contacted',
  replied: 'Replied',
  initial_discussion: 'Initial Discussion',
  follow_up_required: 'Follow-up Required',
  discovery_call_booked: 'Discovery Call Booked',
  discovery_call_completed: 'Discovery Call Completed',
  demo_booked: 'Demo Booked',
  demo_completed: 'Demo Completed',
  paid_pilot_proposal_sent: 'Paid-Pilot Proposal Sent',
  negotiation: 'Negotiation',
  paid_pilot_won: 'Paid Pilot Won',
  recurring_contract_won: 'Recurring Contract Won',
}

export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  awareness: 'Awareness',
  interest: 'Interest',
  consideration: 'Consideration',
  decision: 'Decision',
  action_retention: 'Action and Retention',
}

export const STAGE_TO_FUNNEL: Record<PipelineStage, FunnelStage> = {
  lead_added: 'awareness',
  qualified: 'awareness',
  contacted: 'awareness',
  replied: 'interest',
  initial_discussion: 'interest',
  follow_up_required: 'interest',
  discovery_call_booked: 'consideration',
  discovery_call_completed: 'consideration',
  demo_booked: 'consideration',
  demo_completed: 'consideration',
  paid_pilot_proposal_sent: 'decision',
  negotiation: 'decision',
  paid_pilot_won: 'action_retention',
  recurring_contract_won: 'action_retention',
}

export const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  leads_added: 'Leads added',
  qualified_leads: 'Qualified leads',
  leads_contacted: 'Leads contacted',
  replies: 'Replies',
  discovery_calls_booked: 'Discovery calls booked',
  demos_booked: 'Demos booked',
  proposals_sent: 'Proposals sent',
  paid_pilots_won: 'Paid pilots won',
}

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  active: 'Active',
  nurture: 'Nurture',
  won: 'Won',
  lost: 'Lost',
  archived: 'Archived',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  founder: 'Founder',
  lead_generator: 'Lead Generator',
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  research: 'Research',
  data_enrichment: 'Data enrichment',
  qualification: 'Qualification',
  outreach_preparation: 'Outreach preparation',
  follow_up: 'Follow-up',
  administrative: 'Administrative',
  other: 'Other',
}
