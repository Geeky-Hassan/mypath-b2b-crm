import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  Textarea,
} from '../components/ui'
import { useToast } from '../components/ui/ToastProvider'
import { LeadReadinessBadge } from '../components/LeadReadinessBadge'
import { useAsyncData } from '../hooks/useAsyncData'
import { downloadText, leadsToExportCsv } from '../lib/csv'
import { findDuplicateLeads, type DuplicateMatch } from '../lib/duplicates'
import {
  dateInputValue,
  formatDate,
  formatDateTime,
  formatMoney,
  stageLabel,
} from '../lib/format'
import {
  leadFormSchema,
  leadGeneratorLeadFormSchema,
  leadFormValuesToInput,
  leadToFormValues,
  type LeadFormValues,
} from '../lib/leadValidation'
import { formatPhone, PHONE_COUNTRY_OPTIONS } from '../lib/phone'
import {
  DEFAULT_LEAD_FILTERS,
  addActivity,
  deleteActivity,
  getAllLeads,
  getLeadDuplicateCandidates,
  getLeadsPage,
  getProfiles,
  getSettings,
  permanentlyDeleteLead,
  saveLead,
  setLeadArchived,
  moveLeadStage,
} from '../services/crm'
import {
  ACTIVITY_TYPES,
  LEAD_PRIORITIES,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  LIFECYCLE_LABELS,
  LIFECYCLE_STATUSES,
  PIPELINE_STAGES,
  type ActivityType,
  type LeadFilters,
  type LeadRecord,
  type Profile,
} from '../types/domain'

const activitySchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  activity_date: z.string().min(1, 'Choose an activity date.'),
  summary: z.string().trim().min(1, 'Add a short summary.'),
  notes: z.string(),
})

type ActivityValues = z.infer<typeof activitySchema>

function toneForStage(stage: LeadRecord['current_pipeline_stage']) {
  if (stage === 'paid_pilot_won' || stage === 'recurring_contract_won') {
    return 'green' as const
  }
  if (stage === 'negotiation' || stage === 'paid_pilot_proposal_sent') {
    return 'amber' as const
  }
  return 'teal' as const
}

function labelForActivity(type: ActivityType): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4 border-b border-slate-200 pb-6 last:border-0 last:pb-0">
      <div>
        <h3 className="font-bold text-slate-950">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  )
}

export function LeadForm({
  lead,
  profiles,
  currentUserId,
  isFounder,
  onSaved,
  onCancel,
}: {
  lead?: LeadRecord
  profiles: Profile[]
  currentUserId: string
  isFounder: boolean
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([])
  const assignableProfiles = profiles.filter(
    (profile) => profile.account_status === 'active' || profile.id === lead?.owner_id,
  )
  const { toast } = useToast()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(isFounder ? leadFormSchema : leadGeneratorLeadFormSchema),
    defaultValues: leadToFormValues(lead, currentUserId),
  })

  const persist = async (values: LeadFormValues, allowDuplicate = false) => {
    setError(null)
    try {
      if (!allowDuplicate) {
        const candidates = await getLeadDuplicateCandidates()
        const duplicates = findDuplicateLeads(values, candidates, lead?.id)
        if (duplicates.length) {
          setDuplicateMatches(duplicates)
          return
        }
      }
      setDuplicateMatches([])
      await saveLead(leadFormValuesToInput(values), currentUserId, lead?.id, isFounder)
      toast({
        title: lead ? 'Lead updated.' : 'Lead added.',
        tone: 'success',
      })
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The lead could not be saved.')
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit((values) => persist(values))}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {duplicateMatches.length ? (
        <Alert tone="warning" title="Possible duplicate">
          <p>
            The email or website matches {duplicateMatches.length} existing lead
            {duplicateMatches.length === 1 ? '' : 's'}.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {duplicateMatches.map((match) => (
              <li
                key={match.id ?? `${match.company_name}-${match.matchedFields.join('-')}`}
              >
                {match.company_name} — matched {match.matchedFields.join(' and ')}
              </li>
            ))}
          </ul>
          <Button
            className="mt-3"
            size="sm"
            type="button"
            variant="secondary"
            loading={isSubmitting}
            onClick={() => void handleSubmit((values) => persist(values, true))()}
          >
            Save anyway
          </Button>
        </Alert>
      ) : null}

      <FormSection title="Company" description="The organisation and market context.">
        <Field label="Company name" required error={errors.company_name?.message}>
          <Input {...register('company_name')} autoFocus />
        </Field>
        <Field label="Website" error={errors.website?.message} hint="Include https://">
          <Input {...register('website')} placeholder="https://example.com" />
        </Field>
        <Field label="Country">
          <Input {...register('country')} />
        </Field>
        <Field label="Region">
          <Input {...register('region')} />
        </Field>
        <Field label="Customer segment">
          <Input {...register('customer_segment')} />
        </Field>
        <Field label="Company size">
          <Input {...register('company_size')} placeholder="e.g. 51-200" />
        </Field>
        <Field label="Education offering">
          <Input {...register('education_offering')} />
        </Field>
        <Field label="Current LMS or tools">
          <Input {...register('current_lms_or_tools')} />
        </Field>
      </FormSection>

      <FormSection title="Primary contact">
        <Field label="Contact name">
          <Input {...register('contact_name')} />
        </Field>
        <Field label="Job title">
          <Input {...register('job_title')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input {...register('email')} type="email" />
        </Field>
        <Field label="Phone country code">
          <Select {...register('contact_phone_country')}>
            <option value="">Select country code</option>
            {PHONE_COUNTRY_OPTIONS.map((option) => (
              <option key={option.country} value={option.country}>
                {option.name} (+{option.callingCode})
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Contact number"
          error={errors.contact_phone_national?.message}
          hint="Optional; the country code is stored with the number."
        >
          <Input
            {...register('contact_phone_national')}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="300 1234567"
          />
        </Field>
        <Field label="LinkedIn URL" error={errors.linkedin_url?.message}>
          <Input
            {...register('linkedin_url')}
            placeholder="https://linkedin.com/in/..."
          />
        </Field>
        <Field label="Decision-maker status">
          <Input {...register('decision_maker_status')} />
        </Field>
      </FormSection>

      <FormSection
        title="Qualification"
        description="Shared context for deciding where to focus."
      >
        <Field label="Main pain point">
          <Textarea {...register('main_pain_point')} rows={3} />
        </Field>
        <Field label="Why MyPath is relevant">
          <Textarea {...register('reason_mypath_is_relevant')} rows={3} />
        </Field>
        <Field label="Current alternative">
          <Input {...register('current_alternative')} />
        </Field>
        <Field label="Budget indicator">
          <Input {...register('budget_indicator')} />
        </Field>
        <Field label="Qualification score" error={errors.qualification_score?.message}>
          <Input
            {...register('qualification_score')}
            type="number"
            min="0"
            max="11"
            step="1"
            inputMode="numeric"
            placeholder="0-11"
          />
        </Field>
        <Field label="Priority">
          <Select {...register('priority')}>
            {LEAD_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority.charAt(0).toUpperCase() + priority.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source">
          <Select {...register('source')}>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {LEAD_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner" error={errors.owner_id?.message}>
          <Select {...register('owner_id')}>
            {assignableProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      {isFounder ? (
        <FormSection title="Pipeline and follow-up">
          <Field
            label="Pipeline stage"
            hint="Move stages from the Pipeline page so the date, description, and follow-up are recorded together."
          >
            <input type="hidden" {...register('current_pipeline_stage')} />
            <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] font-medium text-slate-700">
              {stageLabel(lead?.current_pipeline_stage ?? 'lead_added')}
            </div>
          </Field>
          <Field label="Lifecycle status">
            <Select {...register('lifecycle_status')}>
              {LIFECYCLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {LIFECYCLE_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date added" required error={errors.date_added?.message}>
            <Input {...register('date_added')} type="date" />
          </Field>
          <Field label="First contacted">
            <Input {...register('first_contacted_at')} type="datetime-local" />
          </Field>
          <Field label="Last contacted">
            <Input {...register('last_contacted_at')} type="datetime-local" />
          </Field>
          <Field label="Next action">
            <Input {...register('next_action')} />
          </Field>
          <Field label="Next action date">
            <Input {...register('next_action_date')} type="date" />
          </Field>
          <Field label="Demo date">
            <Input {...register('demo_date')} type="datetime-local" />
          </Field>
          <Field label="Proposed value" error={errors.proposed_value?.message}>
            <Input {...register('proposed_value')} inputMode="decimal" />
          </Field>
          <Field label="Lost reason" error={errors.lost_reason?.message}>
            <Input {...register('lost_reason')} />
          </Field>
        </FormSection>
      ) : (
        <FormSection
          title="Lead record"
          description="Add the next action needed before this research is ready for the Founder."
        >
          <Field label="Date added" required error={errors.date_added?.message}>
            <Input {...register('date_added')} type="date" />
          </Field>
          <Field label="Next action">
            <Input {...register('next_action')} />
          </Field>
          <Field label="Next action date">
            <Input {...register('next_action_date')} type="date" />
          </Field>
        </FormSection>
      )}

      {isFounder ? (
        <FormSection
          title="Deal"
          description="Founder-only close planning in the CRM interface."
        >
          <Field label="Expected close date">
            <Input {...register('expected_close_date')} type="date" />
          </Field>
        </FormSection>
      ) : null}

      <FormSection title="Working notes">
        <div className="md:col-span-2">
          <Field label="Notes">
            <Textarea {...register('notes')} rows={5} />
          </Field>
        </div>
      </FormSection>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {lead ? 'Save changes' : 'Add lead'}
        </Button>
      </div>
    </form>
  )
}

function LeadDetail({
  lead,
  currency,
  currentUserId,
  isFounder,
  onEdit,
  onDelete,
  onRefresh,
}: {
  lead: LeadRecord
  currency: string
  currentUserId: string
  isFounder: boolean
  onEdit: () => void
  onDelete: () => void
  onRefresh: () => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [qualifying, setQualifying] = useState(false)
  const [qualifyOpen, setQualifyOpen] = useState(false)
  const [qualificationContext, setQualificationContext] = useState('')
  const [qualificationFollowUp, setQualificationFollowUp] = useState(false)
  const [qualificationFollowUpDate, setQualificationFollowUpDate] = useState('')
  const { toast } = useToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ActivityValues>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      activity_type: 'note',
      activity_date: new Date().toISOString().slice(0, 16),
      summary: '',
      notes: '',
    },
  })

  const submitActivity = async (values: ActivityValues) => {
    setError(null)
    try {
      await addActivity(
        lead.id,
        {
          ...values,
          activity_date: new Date(values.activity_date).toISOString(),
        },
        currentUserId,
      )
      reset({
        activity_type: 'note',
        activity_date: new Date().toISOString().slice(0, 16),
        summary: '',
        notes: '',
      })
      toast({ title: 'Activity added.', tone: 'success' })
      await onRefresh()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The activity could not be added.',
      )
    }
  }

  const removeActivity = async (id: string) => {
    if (!window.confirm('Remove this activity permanently?')) return
    setError(null)
    try {
      await deleteActivity(id)
      toast({ title: 'Activity removed.', tone: 'success' })
      await onRefresh()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The activity could not be removed.',
      )
    }
  }

  const qualifyLead = async () => {
    if (!qualificationContext.trim()) return
    if (qualificationFollowUp && !qualificationFollowUpDate) return
    setQualifying(true)
    setError(null)
    try {
      await moveLeadStage(lead.id, 'qualified', {
        description: qualificationContext,
        followUpRequired: qualificationFollowUp,
        followUpDate: qualificationFollowUpDate || undefined,
      })
      toast({ title: `${lead.company_name} marked qualified.`, tone: 'success' })
      setQualifyOpen(false)
      setQualificationContext('')
      setQualificationFollowUp(false)
      setQualificationFollowUpDate('')
      await onRefresh()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The lead could not be qualified.',
      )
    } finally {
      setQualifying(false)
    }
  }

  return (
    <div className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={toneForStage(lead.current_pipeline_stage)}>
          {stageLabel(lead.current_pipeline_stage)}
        </Badge>
        <Badge>{LIFECYCLE_LABELS[lead.lifecycle_status]}</Badge>
        <Badge
          tone={
            lead.priority === 'high'
              ? 'red'
              : lead.priority === 'medium'
                ? 'amber'
                : 'slate'
          }
        >
          {lead.priority} priority
        </Badge>
        <LeadReadinessBadge lead={lead} />
        <Button className="ml-auto" size="sm" variant="secondary" onClick={onEdit}>
          Edit lead
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          Delete...
        </Button>
        {!isFounder && lead.current_pipeline_stage === 'lead_added' ? (
          <Button size="sm" onClick={() => setQualifyOpen(true)}>
            Mark qualified
          </Button>
        ) : null}
      </div>

      <Card className="grid gap-5 p-5 sm:grid-cols-2">
        <Detail label="Primary contact" value={lead.contact_name} />
        <Detail label="Email" value={lead.email} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Contact phone
          </p>
          {lead.contact_phone ? (
            <a
              className="mt-1 inline-block text-sm font-medium text-blue-700 hover:text-blue-800"
              href={`tel:${lead.contact_phone}`}
            >
              {formatPhone(lead.contact_phone)}
            </a>
          ) : (
            <p className="mt-1 text-sm font-medium text-slate-800">—</p>
          )}
        </div>
        <Detail label="Website" value={lead.website} />
        <Detail
          label="Country / region"
          value={[lead.country, lead.region].filter(Boolean).join(' · ')}
        />
        <Detail label="Segment" value={lead.customer_segment} />
        <Detail label="Owner" value={lead.owner?.full_name} />
        <Detail
          label="Qualification"
          value={
            lead.qualification_score == null ? null : `${lead.qualification_score}/11`
          }
        />
        {isFounder ? (
          <Detail
            label="Proposed value"
            value={formatMoney(lead.proposed_value, currency)}
          />
        ) : null}
        <Detail label="Next action" value={lead.next_action} />
        <Detail label="Next action date" value={formatDate(lead.next_action_date)} />
      </Card>

      <section>
        <h3 className="font-bold text-slate-950">Lead notes</h3>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          {lead.notes || 'No working notes have been added.'}
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-bold text-slate-950">Activity timeline</h3>
          <p className="mt-1 text-xs text-slate-500">
            Log calls, emails, meetings, demos, and notes.
          </p>
        </div>
        <form
          className="space-y-3 rounded-xl border border-slate-200 p-4"
          onSubmit={handleSubmit(submitActivity)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Select {...register('activity_type')}>
                {ACTIVITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {labelForActivity(type)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" error={errors.activity_date?.message}>
              <Input {...register('activity_date')} type="datetime-local" />
            </Field>
          </div>
          <Field label="Summary" error={errors.summary?.message}>
            <Input {...register('summary')} placeholder="What happened?" />
          </Field>
          <Field label="Detail">
            <Textarea {...register('notes')} rows={2} />
          </Field>
          <Button size="sm" type="submit" loading={isSubmitting}>
            Add activity
          </Button>
        </form>
        {lead.activities?.length ? (
          <ol className="space-y-3">
            {lead.activities.map((activity) => (
              <li key={activity.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone="blue">
                        {labelForActivity(activity.activity_type)}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        {formatDate(activity.activity_date)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {activity.summary}
                    </p>
                    {activity.notes ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                        {activity.notes}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-400">
                      {activity.creator?.full_name ?? 'CRM user'}
                    </p>
                  </div>
                  {isFounder || activity.created_by === currentUserId ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                      onClick={() => void removeActivity(activity.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">No activities yet.</p>
        )}
      </section>

      <section>
        <h3 className="font-bold text-slate-950">Stage-change history</h3>
        {lead.stage_history?.length ? (
          <ol className="mt-3 space-y-3">
            {lead.stage_history.map((event) => (
              <li
                key={event.id}
                className="flex items-start justify-between gap-4 border-l-2 border-blue-200 pl-4 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-800">
                    {event.previous_stage
                      ? `${stageLabel(event.previous_stage)} → `
                      : 'Started at '}
                    {stageLabel(event.new_stage)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {event.actor?.full_name ?? 'CRM user'}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                    {event.description || 'No stage context was recorded.'}
                  </p>
                  {event.follow_up_required ? (
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      Follow-up required on {formatDate(event.follow_up_date)}
                    </p>
                  ) : null}
                </div>
                <time className="shrink-0 text-xs text-slate-500">
                  {formatDateTime(event.changed_at)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No stage changes recorded yet.</p>
        )}
      </section>

      <Modal
        open={qualifyOpen}
        onClose={() => {
          setQualifyOpen(false)
          setQualificationContext('')
          setQualificationFollowUp(false)
          setQualificationFollowUpDate('')
        }}
        title="Mark lead qualified"
        description={lead.company_name}
        size="md"
      >
        <div className="space-y-4">
          <Field
            label="Qualification context"
            required
            hint="This description becomes part of the permanent stage history."
          >
            <Textarea
              rows={3}
              value={qualificationContext}
              placeholder="Explain why this lead is qualified and what should happen next."
              onChange={(event) => setQualificationContext(event.target.value)}
            />
          </Field>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={qualificationFollowUp}
                onChange={(event) => {
                  setQualificationFollowUp(event.target.checked)
                  if (!event.target.checked) setQualificationFollowUpDate('')
                }}
              />
              Follow-up required
            </label>
            {qualificationFollowUp ? (
              <div className="mt-3">
                <Field label="Exact follow-up date" required>
                  <Input
                    type="date"
                    value={qualificationFollowUpDate}
                    onChange={(event) => setQualificationFollowUpDate(event.target.value)}
                  />
                </Field>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setQualifyOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={qualifying}
              disabled={
                !qualificationContext.trim() ||
                (qualificationFollowUp && !qualificationFollowUpDate)
              }
              onClick={() => void qualifyLead()}
            >
              Mark qualified
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value || '—'}</p>
    </div>
  )
}

export default function LeadsPage() {
  const { profile, user } = useAuth()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_LEAD_FILTERS)
  const [formLead, setFormLead] = useState<LeadRecord | null | 'new'>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteLead, setDeleteLead] = useState<LeadRecord | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [preparedForDeletion, setPreparedForDeletion] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [quickView, setQuickView] = useState('all')
  const key = JSON.stringify(filters)
  const { data, error, loading, refresh } = useAsyncData(async () => {
    const [page, profiles, settings] = await Promise.all([
      getLeadsPage(filters),
      getProfiles(),
      getSettings(),
    ])
    return { page, profiles, settings }
  }, key)
  const selected = useMemo(
    () => data?.page.leads.find((lead) => lead.id === selectedId) ?? null,
    [data, selectedId],
  )
  const isFounder = profile?.role === 'founder'
  const totalPages = Math.max(1, Math.ceil((data?.page.count ?? 0) / filters.pageSize))

  const updateFilter = <K extends keyof LeadFilters>(
    keyName: K,
    value: LeadFilters[K],
  ) => {
    setFilters((current) => ({
      ...current,
      [keyName]: value,
      page: keyName === 'page' ? (value as number) : 1,
    }))
  }

  const applyQuickView = (view: string) => {
    if (!user) return
    const next = { ...DEFAULT_LEAD_FILTERS }
    if (view === 'assigned') next.ownerId = user.id
    if (view === 'sourced') next.creatorId = user.id
    if (view === 'qualification') {
      next.creatorId = user.id
      next.stage = 'lead_added'
    }
    if (view === 'missing') {
      next.creatorId = user.id
      next.readiness = 'missing'
    }
    if (view === 'ready') {
      next.creatorId = user.id
      next.readiness = 'ready'
    }
    setFilters(next)
    setQuickView(view)
  }

  useEffect(() => {
    if (!isFounder && searchParams.get('view') === 'missing') applyQuickView('missing')
    // This only applies the intentional URL entry view; later filter edits stay local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFounder, searchParams, user?.id])

  const archive = async (lead: LeadRecord) => {
    setWorking(true)
    setActionError(null)
    try {
      await setLeadArchived(lead.id, lead.lifecycle_status !== 'archived')
      toast({
        title: lead.lifecycle_status === 'archived' ? 'Lead restored.' : 'Lead archived.',
        tone: 'success',
      })
      setSelectedId(null)
      await refresh()
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The lead could not be updated.',
      )
    } finally {
      setWorking(false)
    }
  }

  const archiveForDeletion = async () => {
    if (!deleteLead || deleteLead.lifecycle_status === 'archived') return
    setWorking(true)
    setActionError(null)
    try {
      await setLeadArchived(deleteLead.id, true)
      setDeleteLead({ ...deleteLead, lifecycle_status: 'archived' })
      setPreparedForDeletion(true)
      setDeleteConfirmation('')
      toast({
        title: 'Lead archived. Complete the final confirmation to delete it.',
        tone: 'success',
      })
      await refresh()
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The lead could not be archived.',
      )
    } finally {
      setWorking(false)
    }
  }

  const restoreFromDeletion = async () => {
    if (!deleteLead || deleteLead.lifecycle_status !== 'archived') return
    setWorking(true)
    setActionError(null)
    try {
      await setLeadArchived(deleteLead.id, false)
      toast({ title: 'Lead restored. Permanent deletion cancelled.', tone: 'success' })
      setDeleteLead(null)
      setDeleteConfirmation('')
      setPreparedForDeletion(false)
      await refresh()
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The lead could not be restored.',
      )
    } finally {
      setWorking(false)
    }
  }

  const remove = async () => {
    if (!deleteLead || deleteConfirmation !== deleteLead.company_name) return
    setWorking(true)
    setActionError(null)
    try {
      await permanentlyDeleteLead(deleteLead.id, deleteConfirmation)
      toast({ title: 'Lead permanently deleted.', tone: 'success' })
      setDeleteLead(null)
      setDeleteConfirmation('')
      setPreparedForDeletion(false)
      setSelectedId(null)
      await refresh()
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The lead could not be deleted.',
      )
    } finally {
      setWorking(false)
    }
  }

  const exportFiltered = async () => {
    setWorking(true)
    setActionError(null)
    try {
      const leads = await getAllLeads({ ...filters, page: 1 })
      downloadText(`mypath-leads-${dateInputValue()}.csv`, leadsToExportCsv(leads))
      toast({ title: 'Filtered leads exported.', tone: 'success' })
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The export could not be created.',
      )
    } finally {
      setWorking(false)
    }
  }

  if (loading && !data) return <PageLoader label="Loading leads…" />

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Shared CRM"
        title="Leads"
        description="Research, qualify, and move every opportunity from one workspace."
        action={
          <div className="flex gap-2">
            {isFounder ? (
              <Button
                variant="secondary"
                onClick={() => void exportFiltered()}
                loading={working}
              >
                Export filtered
              </Button>
            ) : null}
            <Button onClick={() => setFormLead('new')}>Add lead</Button>
          </div>
        }
      />
      {error ? (
        <Alert tone="warning" title="Latest lead changes could not be refreshed">
          {error} The last successfully loaded leads remain visible.
        </Alert>
      ) : null}
      {actionError && !deleteLead ? <Alert tone="error">{actionError}</Alert> : null}

      {!isFounder ? (
        <div className="flex flex-wrap gap-2" aria-label="Quick lead views">
          {[
            ['all', 'All leads'],
            ['assigned', 'My assigned leads'],
            ['sourced', 'My sourced leads'],
            ['qualification', 'Needs qualification'],
            ['missing', 'Missing information'],
            ['ready', 'Ready for Founder'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={quickView === value}
              onClick={() => applyQuickView(value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${quickView === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-100 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <Card className="space-y-3 p-3">
        <div className="grid gap-2 lg:grid-cols-[2fr_repeat(3,1fr)]">
          <Input
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder="Search company, contact, email, or website"
            aria-label="Search leads"
          />
          <Select
            value={filters.stage}
            onChange={(event) =>
              updateFilter('stage', event.target.value as LeadFilters['stage'])
            }
            aria-label="Filter by stage"
          >
            <option value="all">All stages</option>
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stageLabel(stage)}
              </option>
            ))}
          </Select>
          <Select
            value={filters.lifecycle}
            onChange={(event) =>
              updateFilter('lifecycle', event.target.value as LeadFilters['lifecycle'])
            }
            aria-label="Filter by lifecycle"
          >
            <option value="all">All lifecycle statuses</option>
            {LIFECYCLE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LIFECYCLE_LABELS[status]}
              </option>
            ))}
          </Select>
          <Select
            value={filters.ownerId}
            onChange={(event) => updateFilter('ownerId', event.target.value)}
            aria-label="Filter by owner"
          >
            <option value="">All owners</option>
            {data?.profiles.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          <Input
            value={filters.country}
            onChange={(event) => updateFilter('country', event.target.value)}
            placeholder="Country"
            aria-label="Filter by country"
          />
          <Input
            value={filters.segment}
            onChange={(event) => updateFilter('segment', event.target.value)}
            placeholder="Segment"
            aria-label="Filter by segment"
          />
          <Select
            value={filters.source}
            onChange={(event) =>
              updateFilter('source', event.target.value as LeadFilters['source'])
            }
            aria-label="Filter by source"
          >
            <option value="all">All sources</option>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {LEAD_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
          <Select
            value={filters.readiness}
            onChange={(event) =>
              updateFilter('readiness', event.target.value as LeadFilters['readiness'])
            }
            aria-label="Filter by founder readiness"
          >
            <option value="all">All readiness states</option>
            <option value="ready">Ready for Founder</option>
            <option value="missing">Missing information</option>
          </Select>
          <Select
            value={filters.priority}
            onChange={(event) =>
              updateFilter('priority', event.target.value as LeadFilters['priority'])
            }
            aria-label="Filter by priority"
          >
            <option value="all">All priorities</option>
            {LEAD_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </Select>
          <Select
            value={filters.sortBy}
            onChange={(event) =>
              updateFilter('sortBy', event.target.value as LeadFilters['sortBy'])
            }
            aria-label="Sort leads"
          >
            <option value="updated_at">Recently updated</option>
            <option value="date_added">Date added</option>
            <option value="company_name">Company name</option>
            <option value="qualification_score">Qualification score</option>
            <option value="next_action_date">Next action</option>
            {isFounder ? <option value="proposed_value">Proposed value</option> : null}
          </Select>
          <Select
            value={filters.sortDirection}
            onChange={(event) =>
              updateFilter(
                'sortDirection',
                event.target.value as LeadFilters['sortDirection'],
              )
            }
            aria-label="Sort direction"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </Select>
        </div>
      </Card>

      {!data?.page.leads.length ? (
        <EmptyState
          title="No leads found"
          description="Adjust the filters or add the first lead to this view."
          action={<Button onClick={() => setFormLead('new')}>Add lead</Button>}
        />
      ) : (
        <DataTable>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Founder readiness</th>
              <th className="px-4 py-3">Next action</th>
              {isFounder ? <th className="px-4 py-3">Value</th> : null}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.page.leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-left font-semibold text-slate-900 hover:text-blue-700"
                    onClick={() => setSelectedId(lead.id)}
                  >
                    {lead.company_name}
                  </button>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {lead.country || lead.website || 'No market detail'}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <p>{lead.contact_name || '—'}</p>
                  <p className="text-xs text-slate-400">{lead.email}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={toneForStage(lead.current_pipeline_stage)}>
                    {stageLabel(lead.current_pipeline_stage)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {lead.owner?.full_name ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      lead.priority === 'high'
                        ? 'red'
                        : lead.priority === 'medium'
                          ? 'amber'
                          : 'slate'
                    }
                  >
                    {lead.priority}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <LeadReadinessBadge lead={lead} />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <p>{lead.next_action || '—'}</p>
                  <p className="text-xs text-slate-400">
                    {formatDate(lead.next_action_date)}
                  </p>
                </td>
                {isFounder ? (
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {formatMoney(lead.proposed_value, data.settings.default_currency)}
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setFormLead(lead)}>
                      Edit
                    </Button>
                    {isFounder ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={working}
                        onClick={() => void archive(lead)}
                      >
                        {lead.lifecycle_status === 'archived' ? 'Restore' : 'Archive'}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setDeleteLead(lead)
                        setDeleteConfirmation('')
                        setPreparedForDeletion(false)
                        setActionError(null)
                      }}
                    >
                      Delete...
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <div className="flex items-center justify-between text-sm text-slate-500">
        <p>
          {data?.page.count ?? 0} lead{data?.page.count === 1 ? '' : 's'} · Page{' '}
          {filters.page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={filters.page <= 1}
            onClick={() => updateFilter('page', filters.page - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={filters.page >= totalPages}
            onClick={() => updateFilter('page', filters.page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Modal
        open={formLead !== null}
        onClose={() => setFormLead(null)}
        title={
          formLead === 'new' ? 'Add lead' : `Edit ${formLead?.company_name ?? 'lead'}`
        }
        description="Company, contact, qualification, and follow-up information."
        size="xl"
      >
        {user && data ? (
          <LeadForm
            lead={formLead === 'new' ? undefined : (formLead ?? undefined)}
            profiles={data.profiles}
            currentUserId={user.id}
            isFounder={isFounder}
            onCancel={() => setFormLead(null)}
            onSaved={async () => {
              setFormLead(null)
              await refresh()
            }}
          />
        ) : null}
      </Modal>

      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected?.company_name ?? 'Lead detail'}
        description={selected?.contact_name ?? undefined}
      >
        {selected && user && data ? (
          <LeadDetail
            lead={selected}
            currency={data.settings.default_currency}
            currentUserId={user.id}
            isFounder={isFounder}
            onEdit={() => {
              setFormLead(selected)
              setSelectedId(null)
            }}
            onDelete={() => {
              setDeleteLead(selected)
              setDeleteConfirmation('')
              setPreparedForDeletion(false)
              setActionError(null)
              setSelectedId(null)
            }}
            onRefresh={refresh}
          />
        ) : null}
      </Drawer>

      <Modal
        open={deleteLead !== null}
        onClose={() => {
          setDeleteLead(null)
          setDeleteConfirmation('')
          setPreparedForDeletion(false)
          setActionError(null)
        }}
        title="Permanently delete lead"
        description={
          deleteLead?.lifecycle_status === 'archived'
            ? 'Final step: confirm permanent deletion.'
            : 'Step 1 of 2: archive the lead before permanent deletion.'
        }
        size="md"
      >
        {deleteLead ? (
          deleteLead.lifecycle_status !== 'archived' ? (
            <div className="space-y-4">
              {actionError ? <Alert tone="error">{actionError}</Alert> : null}
              <Alert tone="warning" title="Archive required">
                Archiving removes this lead from active workflows while keeping its
                activities and stage history recoverable. After archiving, you can
                complete permanent deletion.
              </Alert>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setDeleteLead(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  loading={working}
                  onClick={() => void archiveForDeletion()}
                >
                  Archive lead first
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {actionError ? <Alert tone="error">{actionError}</Alert> : null}
              <Alert tone="warning" title="This cannot be undone">
                This permanently removes the lead, its activities, and its complete stage
                history. Type <strong>{deleteLead.company_name}</strong> to confirm.
              </Alert>
              <Field label="Company name" required>
                <Input
                  autoFocus
                  autoComplete="off"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                />
              </Field>
              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  loading={working}
                  onClick={() => void restoreFromDeletion()}
                >
                  {preparedForDeletion ? 'Restore and cancel' : 'Restore lead'}
                </Button>
                <Button
                  variant="danger"
                  disabled={deleteConfirmation !== deleteLead.company_name}
                  loading={working}
                  onClick={() => void remove()}
                >
                  Delete permanently
                </Button>
              </div>
            </div>
          )
        ) : null}
      </Modal>
    </div>
  )
}
