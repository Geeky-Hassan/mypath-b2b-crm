import Papa from 'papaparse'
import type { LeadRecord, Profile } from '../types/domain'

export const IMPORT_FIELDS = [
  { key: 'company_name', label: 'Company name', required: true },
  { key: 'website', label: 'Website' },
  { key: 'country', label: 'Country' },
  { key: 'region', label: 'Region' },
  { key: 'customer_segment', label: 'Customer segment' },
  { key: 'company_size', label: 'Company size' },
  { key: 'education_offering', label: 'Education offering' },
  { key: 'current_lms_or_tools', label: 'Current LMS or tools' },
  { key: 'contact_name', label: 'Contact name' },
  { key: 'job_title', label: 'Job title' },
  { key: 'email', label: 'Contact email' },
  { key: 'contact_phone', label: 'Contact phone (international)' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'decision_maker_status', label: 'Decision maker status' },
  { key: 'main_pain_point', label: 'Main pain point' },
  { key: 'reason_mypath_is_relevant', label: 'Why MyPath is relevant' },
  { key: 'current_alternative', label: 'Current alternative' },
  { key: 'budget_indicator', label: 'Budget indicator' },
  { key: 'qualification_score', label: 'Qualification score' },
  { key: 'priority', label: 'Priority' },
  { key: 'source', label: 'Source' },
  { key: 'owner_email', label: 'Owner email' },
  { key: 'current_pipeline_stage', label: 'Pipeline stage' },
  { key: 'lifecycle_status', label: 'Lifecycle status' },
  { key: 'date_added', label: 'Date added' },
  { key: 'first_contacted_at', label: 'First contacted at' },
  { key: 'last_contacted_at', label: 'Last contacted at' },
  { key: 'next_action', label: 'Next action' },
  { key: 'next_action_date', label: 'Next action date' },
  { key: 'demo_date', label: 'Demo date' },
  { key: 'proposed_value', label: 'Proposed value' },
  { key: 'expected_close_date', label: 'Expected close date' },
  { key: 'lost_reason', label: 'Lost reason' },
  { key: 'notes', label: 'Notes' },
] as const

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key']
export type ColumnMapping = Record<ImportFieldKey, string>

export const MAX_CSV_FILE_BYTES = 5 * 1024 * 1024
export const MAX_CSV_IMPORT_ROWS = 5_000

export interface CsvImportReportRow {
  line: number
  company: string
  email: string
  status: 'ready' | 'duplicate' | 'invalid'
  reasons: string[]
}

export const LEAD_GENERATOR_IMPORT_KEYS: ImportFieldKey[] = [
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
  'owner_email',
  'date_added',
  'notes',
]

export function importFieldsForRole(isFounder: boolean) {
  return isFounder
    ? [...IMPORT_FIELDS]
    : IMPORT_FIELDS.filter((field) => LEAD_GENERATOR_IMPORT_KEYS.includes(field.key))
}

export interface ParsedCsv {
  headers: string[]
  rows: Array<Record<string, string>>
  errors: string[]
}

export function parseCsvText(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text.replaceAll('\u0000', ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),
    transform: (value) => value.trim(),
  })
  const headers = result.meta.fields ?? []
  const duplicateHeaders = headers.filter(
    (header, index) =>
      headers.findIndex(
        (candidate) => normalizedHeader(candidate) === normalizedHeader(header),
      ) !== index,
  )
  const errors = result.errors.map(
    (error) => `Row ${(error.row ?? 0) + 2}: ${error.message}`,
  )
  if (duplicateHeaders.length) {
    errors.push(`Duplicate column heading: ${[...new Set(duplicateHeaders)].join(', ')}`)
  }
  if (result.data.length > MAX_CSV_IMPORT_ROWS) {
    errors.push(
      `The file has ${result.data.length.toLocaleString()} rows; split it into batches of ${MAX_CSV_IMPORT_ROWS.toLocaleString()} or fewer.`,
    )
  }
  if (text.includes('\uFFFD')) {
    errors.push(
      'Some characters could not be decoded. Save the file as CSV UTF-8 and retry.',
    )
  }
  return {
    headers,
    rows: result.data,
    errors,
  }
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

const aliases: Partial<Record<ImportFieldKey, string[]>> = {
  company_name: ['company', 'organisation', 'organization'],
  current_lms_or_tools: ['lms', 'current tools'],
  job_title: ['title', 'contact title'],
  email: ['contact email', 'email address'],
  contact_phone: ['phone', 'telephone', 'mobile', 'contact number'],
  owner_email: ['owner', 'assigned to'],
  current_pipeline_stage: ['stage', 'pipeline stage'],
  lifecycle_status: ['lifecycle', 'status'],
  reason_mypath_is_relevant: ['mypath relevance', 'why mypath'],
}

export function autoMapColumns(headers: string[]): ColumnMapping {
  return Object.fromEntries(
    IMPORT_FIELDS.map((field) => {
      const candidates = [field.key, field.label, ...(aliases[field.key] ?? [])].map(
        normalizedHeader,
      )
      const match = headers.find((header) =>
        candidates.includes(normalizedHeader(header)),
      )
      return [field.key, match ?? '']
    }),
  ) as ColumnMapping
}

export function mappingConflicts(mapping: ColumnMapping): string[] {
  const selected = Object.entries(mapping).filter((entry) => entry[1]) as Array<
    [ImportFieldKey, string]
  >
  const columns = new Set(selected.map(([, source]) => source))
  return [...columns]
    .map((source) => {
      const fields = selected
        .filter(([, selectedSource]) => selectedSource === source)
        .map(([key]) => IMPORT_FIELDS.find((field) => field.key === key)?.label ?? key)
      return fields.length > 1 ? `${source} is mapped to ${fields.join(' and ')}` : ''
    })
    .filter(Boolean)
}

export function mapCsvRecord(
  row: Record<string, string>,
  mapping: ColumnMapping,
): Record<ImportFieldKey, string> {
  return Object.fromEntries(
    IMPORT_FIELDS.map((field) => [
      field.key,
      mapping[field.key] ? (row[mapping[field.key]] ?? '') : '',
    ]),
  ) as Record<ImportFieldKey, string>
}

export function importTemplateCsv(): string {
  const example: Record<ImportFieldKey, string | number> = {
    company_name: 'Northstar Learning',
    website: 'https://northstar.example',
    country: 'United Kingdom',
    region: 'Europe',
    customer_segment: 'Training provider',
    company_size: '51-200',
    education_offering: 'Leadership development programmes',
    current_lms_or_tools: 'Moodle and spreadsheets',
    contact_name: 'Alex Morgan',
    job_title: 'Operations Director',
    email: 'alex@northstar.example',
    contact_phone: '+447911123456',
    linkedin_url: 'https://linkedin.com/in/alex-morgan',
    decision_maker_status: 'Decision maker',
    main_pain_point: 'Learner journeys are fragmented across tools',
    reason_mypath_is_relevant: 'Needs one guided learning and progress experience',
    current_alternative: 'Manual LMS workflows',
    budget_indicator: '$10k-$25k',
    qualification_score: 82,
    priority: 'high',
    source: 'linkedin',
    owner_email: 'noor@your-domain.com',
    current_pipeline_stage: 'qualified',
    lifecycle_status: 'active',
    date_added: '2026-08-03',
    first_contacted_at: '2026-08-04T09:00:00Z',
    last_contacted_at: '2026-08-06T15:30:00Z',
    next_action: 'Schedule discovery call',
    next_action_date: '2026-08-10',
    demo_date: '',
    proposed_value: 18000,
    expected_close_date: '2026-09-30',
    lost_reason: '',
    notes: 'Interested in a pilot for the next cohort.',
  }
  return Papa.unparse([example], {
    columns: IMPORT_FIELDS.map((field) => field.key),
    newline: '\r\n',
    escapeFormulae: true,
  })
}

export function leadGeneratorTemplateCsv(): string {
  const rows = [
    {
      company_name: 'Northstar Learning',
      website: 'https://northstar.example',
      country: 'United Kingdom',
      region: 'Europe',
      customer_segment: 'Training provider',
      company_size: '51-200',
      education_offering: 'Leadership development programmes',
      current_lms_or_tools: 'Moodle and spreadsheets',
      contact_name: 'Alex Morgan',
      job_title: 'Operations Director',
      email: 'alex@northstar.example',
      contact_phone: '+447911123456',
      linkedin_url: 'https://linkedin.com/in/alex-morgan',
      decision_maker_status: 'Decision maker',
      main_pain_point: 'Learner journeys are fragmented across tools',
      reason_mypath_is_relevant: 'Needs one guided learning experience',
      current_alternative: 'Manual LMS workflows',
      budget_indicator: 'Budget not yet confirmed',
      qualification_score: '82',
      priority: 'high',
      source: 'linkedin',
      owner_email: '',
      date_added: '2026-08-03',
      notes: 'Example row. Replace or remove before importing.',
    },
    {
      company_name: 'BrightPath Academy',
      website: '',
      country: 'Pakistan',
      region: '',
      customer_segment: 'School network',
      company_size: '',
      education_offering: '',
      current_lms_or_tools: '',
      contact_name: 'Sara Khan',
      job_title: '',
      email: '',
      contact_phone: '+923001234567',
      linkedin_url: '',
      decision_maker_status: '',
      main_pain_point: '',
      reason_mypath_is_relevant: '',
      current_alternative: '',
      budget_indicator: '',
      qualification_score: '',
      priority: 'medium',
      source: 'referral',
      owner_email: '',
      date_added: '2026-08-03',
      notes: 'Most fields are optional; company_name is required.',
    },
  ]
  return Papa.unparse(rows, {
    columns: LEAD_GENERATOR_IMPORT_KEYS,
    newline: '\r\n',
    escapeFormulae: true,
  })
}

export function blankImportTemplateCsv(isFounder: boolean): string {
  const columns = isFounder
    ? IMPORT_FIELDS.map((field) => field.key)
    : LEAD_GENERATOR_IMPORT_KEYS
  return `${Papa.unparse({ fields: [...columns], data: [] }, { newline: '\r\n' })}\r\n`
}

export function importReportCsv(rows: CsvImportReportRow[]): string {
  return Papa.unparse(
    rows.map((row) => ({
      row: row.line,
      company_name: row.company,
      contact_email: row.email,
      status: row.status,
      report: row.reasons.join(' | ') || 'Valid row',
    })),
    { newline: '\r\n', escapeFormulae: true },
  )
}

export function validateCsvFile(file: Pick<File, 'name' | 'size'>): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return 'Choose a .csv file. Excel workbooks must first be saved as CSV UTF-8.'
  }
  if (file.size === 0) return 'The selected CSV file is empty.'
  if (file.size > MAX_CSV_FILE_BYTES) {
    return `The CSV is larger than ${MAX_CSV_FILE_BYTES / 1024 / 1024} MB. Split it into smaller batches.`
  }
  return null
}

export function leadsToExportCsv(leads: LeadRecord[]): string {
  const rows = leads.map((lead) => ({
    ...Object.fromEntries(
      IMPORT_FIELDS.filter((field) => field.key !== 'owner_email').map((field) => [
        field.key,
        lead[field.key as keyof LeadRecord] ?? '',
      ]),
    ),
    owner_email: lead.owner?.email ?? '',
    created_at: lead.created_at,
    updated_at: lead.updated_at,
  }))
  return Papa.unparse(rows, {
    columns: [...IMPORT_FIELDS.map((field) => field.key), 'created_at', 'updated_at'],
    newline: '\r\n',
    escapeFormulae: true,
  })
}

export function resolveOwnerId(
  ownerEmail: string,
  profiles: Profile[],
  currentUserId: string,
): string | null {
  if (!ownerEmail.trim()) return currentUserId
  return (
    profiles.find(
      (profile) =>
        profile.account_status === 'active' &&
        profile.email.toLowerCase() === ownerEmail.trim().toLowerCase(),
    )?.id ?? null
  )
}

export function downloadText(filename: string, content: string): void {
  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
