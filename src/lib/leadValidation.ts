import { z } from 'zod'
import { dateInputValue } from './format'
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LIFECYCLE_STATUSES,
  PIPELINE_STAGES,
  type LeadInput,
  type LeadRecord,
} from '../types/domain'
import { normalizePhone, phoneToParts } from './phone'

const optionalEmail = z.union([z.literal(''), z.email('Enter a valid email address.')])
const optionalUrl = z.string().refine((value) => {
  if (!value.trim()) return true
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}, 'Enter a complete http:// or https:// URL.')

const numericString = (label: string, min: number, max?: number) =>
  z.string().refine(
    (value) => {
      if (!value.trim()) return true
      const number = Number(value)
      return Number.isFinite(number) && number >= min && (max == null || number <= max)
    },
    `${label} must be ${max == null ? `${min} or more` : `between ${min} and ${max}`}.`,
  )

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

const requiredDate = z
  .string()
  .min(1, 'Date added is required.')
  .refine(isCalendarDate, 'Enter a valid date.')
const optionalDate = z
  .string()
  .refine((value) => !value || isCalendarDate(value), 'Enter a valid date.')
const optionalDateTime = z
  .string()
  .refine(
    (value) => !value || !Number.isNaN(new Date(value).valueOf()),
    'Enter a valid date and time.',
  )

const leadFormBaseSchema = z.object({
  company_name: z.string().trim().min(1, 'Company name is required.'),
  website: optionalUrl,
  country: z.string(),
  region: z.string(),
  customer_segment: z.string(),
  company_size: z.string(),
  education_offering: z.string(),
  current_lms_or_tools: z.string(),
  contact_name: z.string(),
  job_title: z.string(),
  email: optionalEmail,
  contact_phone_country: z.string(),
  contact_phone_national: z.string(),
  linkedin_url: optionalUrl,
  decision_maker_status: z.string(),
  main_pain_point: z.string(),
  reason_mypath_is_relevant: z.string(),
  current_alternative: z.string(),
  budget_indicator: z.string(),
  qualification_score: numericString('Qualification score', 0, 100),
  priority: z.enum(LEAD_PRIORITIES),
  source: z.enum(LEAD_SOURCES),
  owner_id: z.string().uuid('Select a valid owner.'),
  current_pipeline_stage: z.enum(PIPELINE_STAGES),
  lifecycle_status: z.enum(LIFECYCLE_STATUSES),
  date_added: requiredDate,
  first_contacted_at: optionalDateTime,
  last_contacted_at: optionalDateTime,
  next_action: z.string(),
  next_action_date: optionalDate,
  demo_date: optionalDateTime,
  proposed_value: numericString('Proposed value', 0),
  expected_close_date: optionalDate,
  lost_reason: z.string(),
  notes: z.string(),
})

export const leadGeneratorLeadFormSchema = leadFormBaseSchema.superRefine(
  (values, context) => {
    const phone = normalizePhone(
      values.contact_phone_country,
      values.contact_phone_national,
    )
    if (phone.error) {
      context.addIssue({
        code: 'custom',
        path: ['contact_phone_national'],
        message: phone.error,
      })
    }
  },
)

export const leadFormSchema = leadGeneratorLeadFormSchema.superRefine(
  (values, context) => {
    if (values.lifecycle_status === 'lost' && !values.lost_reason.trim()) {
      context.addIssue({
        code: 'custom',
        path: ['lost_reason'],
        message: 'Add a lost reason before marking this lead as lost.',
      })
    }
    if (
      [
        'paid_pilot_proposal_sent',
        'negotiation',
        'paid_pilot_won',
        'recurring_contract_won',
      ].includes(values.current_pipeline_stage) &&
      !(Number(values.proposed_value) > 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['proposed_value'],
        message: 'Add a proposed value before entering a commercial stage.',
      })
    }
  },
)

export type LeadFormValues = z.infer<typeof leadFormSchema>

function dateTimeToIso(value: string): string | undefined {
  if (!value.trim()) return undefined
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toISOString()
}

export function leadFormValuesToInput(values: LeadFormValues): LeadInput {
  const phone = normalizePhone(
    values.contact_phone_country,
    values.contact_phone_national,
  )
  return {
    ...values,
    contact_phone: phone.value || undefined,
    qualification_score: values.qualification_score
      ? Number(values.qualification_score)
      : undefined,
    proposed_value: values.proposed_value ? Number(values.proposed_value) : undefined,
    first_contacted_at: dateTimeToIso(values.first_contacted_at),
    last_contacted_at: dateTimeToIso(values.last_contacted_at),
    demo_date: dateTimeToIso(values.demo_date),
  }
}

function dateTimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value.slice(0, 16)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16)
}

export function leadToFormValues(
  lead: LeadRecord | undefined,
  currentUserId: string,
): LeadFormValues {
  const phone = phoneToParts(lead?.contact_phone)
  return {
    company_name: lead?.company_name ?? '',
    website: lead?.website ?? '',
    country: lead?.country ?? '',
    region: lead?.region ?? '',
    customer_segment: lead?.customer_segment ?? '',
    company_size: lead?.company_size ?? '',
    education_offering: lead?.education_offering ?? '',
    current_lms_or_tools: lead?.current_lms_or_tools ?? '',
    contact_name: lead?.contact_name ?? '',
    job_title: lead?.job_title ?? '',
    email: lead?.email ?? '',
    contact_phone_country: phone.country,
    contact_phone_national: phone.nationalNumber,
    linkedin_url: lead?.linkedin_url ?? '',
    decision_maker_status: lead?.decision_maker_status ?? '',
    main_pain_point: lead?.main_pain_point ?? '',
    reason_mypath_is_relevant: lead?.reason_mypath_is_relevant ?? '',
    current_alternative: lead?.current_alternative ?? '',
    budget_indicator: lead?.budget_indicator ?? '',
    qualification_score: lead?.qualification_score?.toString() ?? '',
    priority: lead?.priority ?? 'medium',
    source: lead?.source ?? 'other',
    owner_id: lead?.owner_id ?? currentUserId,
    current_pipeline_stage: lead?.current_pipeline_stage ?? 'lead_added',
    lifecycle_status: lead?.lifecycle_status ?? 'active',
    date_added: lead?.date_added ?? dateInputValue(),
    first_contacted_at: dateTimeLocal(lead?.first_contacted_at),
    last_contacted_at: dateTimeLocal(lead?.last_contacted_at),
    next_action: lead?.next_action ?? '',
    next_action_date: lead?.next_action_date ?? '',
    demo_date: dateTimeLocal(lead?.demo_date),
    proposed_value: lead?.proposed_value?.toString() ?? '',
    expected_close_date: lead?.expected_close_date ?? '',
    lost_reason: lead?.lost_reason ?? '',
    notes: lead?.notes ?? '',
  }
}
