import type { LeadRecord } from '../types/domain'

export const READY_FOR_FOUNDER_TEXT_COLUMNS = [
  'website',
  'country',
  'customer_segment',
  'contact_name',
  'email',
  'main_pain_point',
  'reason_mypath_is_relevant',
  'next_action',
] as const

export const READY_FOR_FOUNDER_COLUMNS = [
  ...READY_FOR_FOUNDER_TEXT_COLUMNS,
  'qualification_score',
] as const

const readinessChecks: Array<{
  label: string
  missing: (lead: LeadRecord) => boolean
}> = [
  { label: 'website', missing: (lead) => !lead.website?.trim() },
  { label: 'country', missing: (lead) => !lead.country?.trim() },
  { label: 'customer segment', missing: (lead) => !lead.customer_segment?.trim() },
  { label: 'contact name', missing: (lead) => !lead.contact_name?.trim() },
  { label: 'contact email', missing: (lead) => !lead.email?.trim() },
  { label: 'main pain point', missing: (lead) => !lead.main_pain_point?.trim() },
  {
    label: 'why MyPath is relevant',
    missing: (lead) => !lead.reason_mypath_is_relevant?.trim(),
  },
  {
    label: 'qualification score',
    missing: (lead) => lead.qualification_score == null,
  },
  { label: 'next action', missing: (lead) => !lead.next_action?.trim() },
]

export function missingLeadInformation(lead: LeadRecord): string[] {
  return readinessChecks
    .filter((check) => check.missing(lead))
    .map((check) => check.label)
}

export function isLeadReadyForFounder(lead: LeadRecord): boolean {
  return missingLeadInformation(lead).length === 0
}
