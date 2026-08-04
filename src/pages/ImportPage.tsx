import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
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
  MAX_CSV_IMPORT_ROWS,
  autoMapColumns,
  downloadText,
  importReportCsv,
  leadsToExportCsv,
  mapCsvRecord,
  mappingConflicts,
  parseCsvText,
  resolveOwnerId,
  importFieldsForRole,
  validateCsvFile,
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
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const conflicts = mapping ? mappingConflicts(mapping) : []
  const mappedCount = mapping
    ? visibleFields.filter((field) => Boolean(mapping[field.key])).length
    : 0
  const currentStep = preview.length ? 3 : parsed ? 2 : 1

  if (loading && !data) return <PageLoader label="Preparing CSV tools…" />
  if (error || !data) {
    return (
      <Alert tone="error" title="Import tools could not be loaded">
        {error ?? 'No CRM data was returned.'}
      </Alert>
    )
  }

  const resetFileState = () => {
    setParsed(null)
    setMapping(null)
    setPreview([])
    setMessage(null)
    setIncludeDuplicates(false)
  }

  const handleSelectedFile = async (file?: File) => {
    resetFileState()
    if (!file) return
    setFileName(file.name)
    try {
      const fileIssue = validateCsvFile(file)
      if (fileIssue) throw new Error(fileIssue)
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
        setMessage({
          tone: 'error',
          text: `${next.errors.slice(0, 5).join(' ')}${next.errors.length > 5 ? ` ${next.errors.length - 5} more parsing issues were found.` : ''}`,
        })
      }
    } catch (caught) {
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'The CSV could not be read.',
      })
    }
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    void handleSelectedFile(event.target.files?.[0])
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    void handleSelectedFile(event.dataTransfer.files[0])
  }

  const createPreview = () => {
    if (!parsed || !mapping || !user) return
    setMessage(null)
    if (parsed.errors.length) {
      setMessage({
        tone: 'error',
        text: 'Fix the CSV parsing issues shown above before validating its rows.',
      })
      return
    }
    if (!mapping.company_name) {
      setMessage({
        tone: 'error',
        text: 'Map the required Company name field before previewing.',
      })
      return
    }
    if (conflicts.length) {
      setMessage({
        tone: 'error',
        text: `Each CSV column can map to only one CRM field. ${conflicts.join('. ')}.`,
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
      if (fileInputRef.current) fileInputRef.current.value = ''
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
      <ol className="grid gap-2 sm:grid-cols-3" aria-label="CSV import progress">
        {['Upload CSV', 'Map & validate', 'Review & save'].map((label, index) => {
          const step = index + 1
          const active = step <= currentStep
          return (
            <li
              key={label}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                active
                  ? 'border-blue-200 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[10px] ${
                  active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {step}
              </span>
              {label}
            </li>
          )
        })}
      </ol>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      <div
        className={
          isFounder ? 'grid gap-4 xl:grid-cols-[2fr_1fr]' : 'grid gap-4 xl:grid-cols-1'
        }
      >
        <Card className="p-4">
          <Badge tone="teal">Import</Badge>
          <h2 className="mt-3 text-base font-bold text-slate-950">Choose a CSV file</h2>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">
            Use the template for fastest setup, or upload another CSV and map its columns
            below.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              className="inline-flex min-h-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
              href={
                isFounder
                  ? '/templates/mypath-leads-template.csv'
                  : '/templates/mypath-lead-generator-template.csv'
              }
              download
            >
              Download example template
            </a>
            <a
              className="inline-flex min-h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              href={
                isFounder
                  ? '/templates/mypath-leads-blank-template.csv'
                  : '/templates/mypath-lead-generator-blank-template.csv'
              }
              download
            >
              Download blank template
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
          <div
            className={`mt-4 rounded-xl border border-dashed p-5 text-center transition ${
              dragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-300 bg-slate-50/70 hover:border-blue-300'
            }`}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <p className="text-xs font-semibold text-slate-800">
              {fileName || 'Drop a CSV here, or choose a file'}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              CSV UTF-8 · maximum 5 MB · up to {MAX_CSV_IMPORT_ROWS.toLocaleString()} rows
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose CSV
            </Button>
            <Input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              aria-label="Choose CSV file"
            />
          </div>
          <p className="mt-3 text-[11px] leading-4 text-slate-500">
            Import creates new leads only. It never overwrites existing leads, and a
            failed database save rolls back the whole accepted batch.
          </p>
        </Card>

        {isFounder ? (
          <Card className="p-4">
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
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge tone="violet">Column mapping</Badge>
              <h2 className="mt-3 text-base font-bold text-slate-950">
                Match CSV columns to CRM fields
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {parsed.rows.length.toLocaleString()} rows · {mappedCount} of{' '}
                {visibleFields.length} fields mapped. Company name is required; unmapped
                optional fields remain blank.
              </p>
            </div>
            <Button onClick={createPreview}>Validate and preview</Button>
          </div>
          {conflicts.length ? (
            <div className="mt-4">
              <Alert tone="warning" title="Resolve duplicate mappings">
                {conflicts.join('. ')}. A source column can map to one CRM field only.
              </Alert>
            </div>
          ) : null}
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
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-950">Import preview</h2>
              <p className="mt-1 text-xs text-slate-500">
                {importable.length} ready · {duplicateCount} duplicate warnings ·{' '}
                {invalidCount} invalid
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadText(
                    `mypath-import-report-${dateInputValue()}.csv`,
                    importReportCsv(preview),
                  )
                }
              >
                Download row report
              </Button>
              <label className="flex items-center gap-2 text-xs text-slate-600">
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
          <div className="mt-4">
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
                {preview.slice(0, 250).map((row) => (
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
            {preview.length > 250 ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Showing the first 250 rows for performance. The downloadable row report
                includes all {preview.length.toLocaleString()} rows.
              </p>
            ) : null}
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
