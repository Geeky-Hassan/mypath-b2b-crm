import { useMemo, useState, type ChangeEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
} from '../components/ui'
import { useToast } from '../components/ui/ToastProvider'
import { useAsyncData } from '../hooks/useAsyncData'
import {
  IMPORT_FIELDS,
  LEAD_GENERATOR_IMPORT_KEYS,
  autoMapColumns,
  leadsToExportCsv,
  mapCsvRecord,
  parseCsvText,
  resolveOwnerId,
  downloadText,
  importFieldsForRole,
  type ColumnMapping,
  type ParsedCsv,
} from '../lib/csv'
import { findDuplicateLeads, type DuplicateCandidate } from '../lib/duplicates'
import { dateInputValue } from '../lib/format'
import {
  leadFormSchema,
  leadGeneratorLeadFormSchema,
  leadFormValuesToInput,
  type LeadFormValues,
} from '../lib/leadValidation'
import { phoneToParts } from '../lib/phone'
import {
  getAllLeads,
  getLeadDuplicateCandidates,
  getProfiles,
  importLeadRows,
} from '../services/crm'
import type { LeadInput } from '../types/domain'

interface PreviewRow {
  line: number
  company: string
  email: string
  status: 'ready' | 'duplicate' | 'invalid'
  reasons: string[]
  input?: LeadInput
}

function valuesForValidation(
  mapped: Record<string, string>,
  ownerId: string,
  isFounder: boolean,
): LeadFormValues {
  const phone = phoneToParts(mapped.contact_phone)
  return {
    company_name: mapped.company_name ?? '',
    website: mapped.website ?? '',
    country: mapped.country ?? '',
    region: mapped.region ?? '',
    customer_segment: mapped.customer_segment ?? '',
    company_size: mapped.company_size ?? '',
    education_offering: mapped.education_offering ?? '',
    current_lms_or_tools: mapped.current_lms_or_tools ?? '',
    contact_name: mapped.contact_name ?? '',
    job_title: mapped.job_title ?? '',
    email: mapped.email ?? '',
    contact_phone_country: phone.country,
    contact_phone_national: phone.nationalNumber,
    linkedin_url: mapped.linkedin_url ?? '',
    decision_maker_status: mapped.decision_maker_status ?? '',
    main_pain_point: mapped.main_pain_point ?? '',
    reason_mypath_is_relevant: mapped.reason_mypath_is_relevant ?? '',
    current_alternative: mapped.current_alternative ?? '',
    budget_indicator: mapped.budget_indicator ?? '',
    qualification_score: mapped.qualification_score ?? '',
    priority: (mapped.priority || 'medium') as LeadFormValues['priority'],
    source: (mapped.source || 'other') as LeadFormValues['source'],
    owner_id: ownerId,
    current_pipeline_stage: (isFounder
      ? mapped.current_pipeline_stage || 'lead_added'
      : 'lead_added') as LeadFormValues['current_pipeline_stage'],
    lifecycle_status: (isFounder
      ? mapped.lifecycle_status || 'active'
      : 'active') as LeadFormValues['lifecycle_status'],
    date_added: mapped.date_added || dateInputValue(),
    first_contacted_at: isFounder ? (mapped.first_contacted_at ?? '') : '',
    last_contacted_at: isFounder ? (mapped.last_contacted_at ?? '') : '',
    next_action: isFounder ? (mapped.next_action ?? '') : '',
    next_action_date: isFounder ? (mapped.next_action_date ?? '') : '',
    demo_date: isFounder ? (mapped.demo_date ?? '') : '',
    proposed_value: isFounder ? (mapped.proposed_value ?? '') : '',
    expected_close_date: isFounder ? (mapped.expected_close_date ?? '') : '',
    lost_reason: isFounder ? (mapped.lost_reason ?? '') : '',
    notes: mapped.notes ?? '',
  }
}

export default function ImportPage() {
  const { user, profile } = useAuth()
  const isFounder = profile?.role === 'founder'
  const { toast } = useToast()
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [fileName, setFileName] = useState('')
  const [message, setMessage] = useState<{
    tone: 'error' | 'success'
    text: string
  } | null>(null)
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const { data, loading, error, refresh } = useAsyncData(async () => {
    const [profiles, duplicateCandidates] = await Promise.all([
      getProfiles(),
      getLeadDuplicateCandidates(),
    ])
    return { profiles, duplicateCandidates }
  }, 'csv-import')

  const importable = useMemo(
    () =>
      preview.filter(
        (row) =>
          row.input &&
          (row.status === 'ready' || (includeDuplicates && row.status === 'duplicate')),
      ),
    [preview, includeDuplicates],
  )
  const invalidCount = preview.filter((row) => row.status === 'invalid').length
  const duplicateCount = preview.filter((row) => row.status === 'duplicate').length
  const visibleFields = importFieldsForRole(isFounder)

  if (loading && !data) return <PageLoader label="Preparing CSV tools…" />
  if (error || !data) {
    return (
      <Alert tone="error" title="Import tools could not be loaded">
        {error ?? 'No CRM data was returned.'}
      </Alert>
    )
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setParsed(null)
    setMapping(null)
    setPreview([])
    setMessage(null)
    if (!file) return
    setFileName(file.name)
    try {
      const next = parseCsvText(await file.text())
      if (!next.headers.length) throw new Error('The CSV does not have a header row.')
      if (!next.rows.length) throw new Error('The CSV does not contain any data rows.')
      setParsed(next)
      const nextMapping = autoMapColumns(next.headers)
      if (!isFounder) {
        IMPORT_FIELDS.forEach((field) => {
          if (!LEAD_GENERATOR_IMPORT_KEYS.includes(field.key)) {
            nextMapping[field.key] = ''
          }
        })
      }
      setMapping(nextMapping)
      if (next.errors.length) {
        setMessage({ tone: 'error', text: next.errors.join(' ') })
      }
    } catch (caught) {
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'The CSV could not be read.',
      })
    }
  }

  const createPreview = () => {
    if (!parsed || !mapping || !user) return
    setMessage(null)
    if (!mapping.company_name) {
      setMessage({
        tone: 'error',
        text: 'Map the required Company name field before previewing.',
      })
      return
    }

    const fileCandidates: DuplicateCandidate[] = []
    const rows = parsed.rows.map<PreviewRow>((record, index) => {
      const mapped = mapCsvRecord(record, mapping)
      const ownerId = resolveOwnerId(mapped.owner_email, data.profiles, user.id)
      if (!ownerId) {
        return {
          line: index + 2,
          company: mapped.company_name,
          email: mapped.email,
          status: 'invalid',
          reasons: [`Owner email ${mapped.owner_email} does not match a CRM user.`],
        }
      }
      const schema = isFounder ? leadFormSchema : leadGeneratorLeadFormSchema
      const parsedValues = schema.safeParse(
        valuesForValidation(mapped, ownerId, isFounder),
      )
      if (!parsedValues.success) {
        return {
          line: index + 2,
          company: mapped.company_name,
          email: mapped.email,
          status: 'invalid',
          reasons: parsedValues.error.issues.map((issue) => issue.message),
        }
      }

      const candidate: DuplicateCandidate = {
        company_name: parsedValues.data.company_name,
        website: parsedValues.data.website,
        email: parsedValues.data.email,
      }
      const matches = findDuplicateLeads(candidate, [
        ...data.duplicateCandidates,
        ...fileCandidates,
      ])
      fileCandidates.push(candidate)
      return {
        line: index + 2,
        company: parsedValues.data.company_name,
        email: parsedValues.data.email,
        status: matches.length ? 'duplicate' : 'ready',
        reasons: matches.length
          ? [
              `Matches ${matches.map((match) => `${match.company_name} (${match.matchedFields.join(' + ')})`).join(', ')}`,
            ]
          : [],
        input: leadFormValuesToInput(parsedValues.data),
      }
    })
    setPreview(rows)
  }

  const runImport = async () => {
    if (!user || !importable.length) return
    setImporting(true)
    setMessage(null)
    try {
      const count = await importLeadRows(
        importable.map((row) => row.input as LeadInput),
        user.id,
        isFounder,
      )
      setMessage({
        tone: 'success',
        text: `${count} lead${count === 1 ? '' : 's'} imported successfully.`,
      })
      toast({
        title: `${count} lead${count === 1 ? '' : 's'} imported.`,
        description: 'The batch was saved as one database operation.',
        tone: 'success',
      })
      setConfirmOpen(false)
      setParsed(null)
      setMapping(null)
      setPreview([])
      setFileName('')
      await refresh()
    } catch (caught) {
      setMessage({
        tone: 'error',
        text:
          caught instanceof Error ? caught.message : 'The import could not be completed.',
      })
      setConfirmOpen(false)
    } finally {
      setImporting(false)
    }
  }

  const exportAll = async () => {
    setImporting(true)
    setMessage(null)
    try {
      const leads = await getAllLeads()
      downloadText(`mypath-leads-${dateInputValue()}.csv`, leadsToExportCsv(leads))
      toast({ title: 'CRM lead export created.', tone: 'success' })
    } catch (caught) {
      setMessage({
        tone: 'error',
        text:
          caught instanceof Error ? caught.message : 'The export could not be created.',
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={isFounder ? 'Founder tools' : 'Lead generation tools'}
        title={isFounder ? 'Import & export' : 'Bulk lead import'}
        description={
          isFounder
            ? 'Map a CSV into the CRM, validate every row, and confirm before saving.'
            : 'Prepare leads in Excel, save as UTF-8 CSV, then validate every row before adding it.'
        }
      />
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      <div
        className={
          isFounder ? 'grid gap-4 xl:grid-cols-[2fr_1fr]' : 'grid gap-4 xl:grid-cols-1'
        }
      >
        <Card className="p-5">
          <Badge tone="teal">Import</Badge>
          <h2 className="mt-3 text-base font-bold text-slate-950">Choose a CSV file</h2>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">
            Use the template for fastest setup, or upload another CSV and map its columns
            below.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              href={
                isFounder
                  ? '/templates/mypath-leads-template.csv'
                  : '/templates/mypath-lead-generator-template.csv'
              }
              download
            >
              Download Excel-ready CSV template
            </a>
          </div>
          {!isFounder ? (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
              Open the template in Excel, replace the example rows, and choose
              <strong> CSV UTF-8</strong> when saving. Company name is required; all other
              research fields are optional. Imported leads always start as Active at Lead
              Added.
            </div>
          ) : null}
          <div className="mt-5">
            <Field
              label="CSV file"
              hint={fileName || 'UTF-8 CSV; up to 1,000 rows recommended'}
            >
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void handleFile(event)}
              />
            </Field>
          </div>
        </Card>

        {isFounder ? (
          <Card className="p-5">
            <Badge tone="blue">Export</Badge>
            <h2 className="mt-3 text-base font-bold text-slate-950">Export CRM leads</h2>
            <p className="mt-1.5 text-xs leading-5 text-slate-500">
              Download all leads here. Use Export filtered on the Leads page to preserve
              the current search and filters.
            </p>
            <Button
              className="mt-5"
              variant="secondary"
              loading={importing}
              onClick={() => void exportAll()}
            >
              Export all leads
            </Button>
          </Card>
        ) : null}
      </div>

      {parsed && mapping ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge tone="violet">Column mapping</Badge>
              <h2 className="mt-3 text-base font-bold text-slate-950">
                Match CSV columns to CRM fields
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {parsed.rows.length} rows found. Company name is required; unmapped
                optional fields remain blank.
              </p>
            </div>
            <Button onClick={createPreview}>Validate and preview</Button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleFields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                required={'required' in field && field.required}
              >
                <Select
                  value={mapping[field.key]}
                  onChange={(event) => {
                    setMapping((current) =>
                      current ? { ...current, [field.key]: event.target.value } : current,
                    )
                    setPreview([])
                  }}
                >
                  <option value="">Do not import</option>
                  {parsed.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        </Card>
      ) : null}

      {preview.length ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-950">Import preview</h2>
              <p className="mt-1 text-xs text-slate-500">
                {importable.length} ready · {duplicateCount} duplicate warnings ·{' '}
                {invalidCount} invalid
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={includeDuplicates}
                  onChange={(event) => setIncludeDuplicates(event.target.checked)}
                />{' '}
                Include warned duplicates
              </label>
              <Button disabled={!importable.length} onClick={() => setConfirmOpen(true)}>
                Review import
              </Button>
            </div>
          </div>
          <div className="mt-5">
            <DataTable>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Contact email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.map((row) => (
                  <tr key={row.line}>
                    <td className="px-4 py-3 text-slate-500">{row.line}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.company || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.email || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          row.status === 'ready'
                            ? 'green'
                            : row.status === 'duplicate'
                              ? 'amber'
                              : 'red'
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="max-w-md px-4 py-3 text-xs text-slate-500">
                      {row.reasons.join(' ') || 'Valid row'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </Card>
      ) : parsed ? (
        <EmptyState
          title="Map and validate your data"
          description="Review the detected mapping, then validate the file to see row-level results."
        />
      ) : null}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm CSV import"
        description="This will create new shared CRM lead records."
        size="md"
      >
        <div className="space-y-4">
          <Alert tone="warning" title="Final check">
            {importable.length} rows will be saved. {invalidCount} invalid rows will be
            skipped.{' '}
            {includeDuplicates
              ? `${duplicateCount} duplicate warnings are included.`
              : `${duplicateCount} duplicate warnings will be skipped.`}
          </Alert>
          <p className="text-sm text-slate-600">
            {isFounder
              ? 'Imported records use their mapped owners, stages, and lifecycle values.'
              : 'Imported records start Active at Lead Added; protected sales and lifecycle columns are ignored.'}{' '}
            Blank owner cells are assigned to you.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button loading={importing} onClick={() => void runImport()}>
              Import {importable.length} rows
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
