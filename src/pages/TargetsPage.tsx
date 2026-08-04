import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  ProgressBar,
  Select,
} from '../components/ui'
import { useToast } from '../components/ui/ToastProvider'
import { useAsyncData } from '../hooks/useAsyncData'
import { currentMonthValue, dateInputValue, monthBounds } from '../lib/format'
import { calculateTargetProgress } from '../lib/metrics'
import {
  deleteTarget,
  getAllLeads,
  getProfiles,
  getTargets,
  saveTarget,
} from '../services/crm'
import {
  TARGET_PERIOD_TYPES,
  TARGET_TYPES,
  TARGET_TYPE_LABELS,
  type Profile,
  type Target,
  type TargetType,
} from '../types/domain'

function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

export const targetSchema = z
  .object({
    period_type: z.enum(TARGET_PERIOD_TYPES),
    start_date: z.string().refine(parseCalendarDate, 'Choose a valid start date.'),
    end_date: z.string().refine(parseCalendarDate, 'Choose a valid end date.'),
    target_type: z.enum(TARGET_TYPES),
    target_value: z
      .string()
      .refine(
        (value) => Number.isInteger(Number(value)) && Number(value) > 0,
        'Enter a positive whole-number target.',
      ),
  })
  .superRefine((values, context) => {
    const start = parseCalendarDate(values.start_date)
    const end = parseCalendarDate(values.end_date)
    if (!start || !end) return
    if (end < start) {
      context.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'End date must be on or after the start date.',
      })
      return
    }
    if (values.period_type === 'weekly') {
      const expectedEnd = new Date(start)
      expectedEnd.setDate(expectedEnd.getDate() + 6)
      if (end.getTime() !== expectedEnd.getTime()) {
        context.addIssue({
          code: 'custom',
          path: ['end_date'],
          message: 'A weekly target must cover exactly seven days.',
        })
      }
      return
    }
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12)
    if (start.getDate() !== 1 || end.getTime() !== lastDay.getTime()) {
      context.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'A monthly target must cover one complete calendar month.',
      })
    }
  })

type TargetValues = z.infer<typeof targetSchema>

const targetFormulas: Record<TargetType, string> = {
  leads_added: 'Leads created by the target user during the target date range.',
  qualified_leads:
    'Distinct leads moved to Qualified by the target user during the date range.',
  leads_contacted:
    'Distinct leads moved to Contacted by the target user during the date range.',
  replies: 'Distinct leads moved to Replied by the target user during the date range.',
  discovery_calls_booked:
    'Distinct leads moved to Discovery Call Booked by the target user during the date range.',
  demos_booked:
    'Distinct leads moved to Demo Booked by the target user during the date range.',
  proposals_sent:
    'Distinct leads moved to Paid-Pilot Proposal Sent by the target user during the date range.',
  paid_pilots_won:
    'Distinct leads moved to Paid Pilot Won by the target user during the date range.',
}

function TargetEditor({
  person,
  target,
  startDate,
  endDate,
  onSaved,
}: {
  person: Profile
  target?: Target
  startDate: string
  endDate: string
  onSaved: () => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TargetValues>({
    resolver: zodResolver(targetSchema),
    defaultValues: {
      period_type: target?.period_type ?? 'monthly',
      start_date: target?.start_date ?? startDate,
      end_date: target?.end_date ?? endDate,
      target_type: target?.target_type ?? 'leads_added',
      target_value: target?.target_value.toString() ?? '',
    },
  })
  const submit = handleSubmit(async (values) => {
    setError(null)
    try {
      await saveTarget({
        id: target?.id,
        user_id: person.id,
        period_type: values.period_type,
        start_date: values.start_date,
        end_date: values.end_date,
        target_type: values.target_type,
        target_value: Number(values.target_value),
      })
      toast({ title: target ? 'Target updated.' : 'Target added.', tone: 'success' })
      await onSaved()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The target could not be saved.',
      )
    }
  })
  return (
    <form className="space-y-5" onSubmit={submit}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Period type">
          <Select {...register('period_type')}>
            {TARGET_PERIOD_TYPES.map((period) => (
              <option key={period} value={period}>
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target type" error={errors.target_type?.message}>
          <Select {...register('target_type')}>
            {TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {TARGET_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start date">
          <Input type="date" {...register('start_date')} />
        </Field>
        <Field label="End date" error={errors.end_date?.message}>
          <Input type="date" {...register('end_date')} />
        </Field>
        <Field label="Target value" error={errors.target_value?.message}>
          <Input type="number" min="1" step="1" {...register('target_value')} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>
          Save target
        </Button>
      </div>
    </form>
  )
}

export default function TargetsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const isFounder = profile?.role === 'founder'
  const [month, setMonth] = useState(currentMonthValue())
  const [editing, setEditing] = useState<{ person: Profile; target?: Target } | null>(
    null,
  )
  const [actionError, setActionError] = useState<string | null>(null)
  const { start, end } = monthBounds(month)
  const startDate = dateInputValue(start)
  const endDate = dateInputValue(new Date(end.valueOf() - 86_400_000))
  const { data, loading, error, refresh } = useAsyncData(async () => {
    const [profiles, targets, leads] = await Promise.all([
      getProfiles(),
      getTargets(startDate, endDate),
      getAllLeads(),
    ])
    return { profiles, targets, leads }
  }, `targets-${profile?.id}-${month}`)

  if (loading) return <PageLoader label="Loading sales targets…" />
  if (error || !data) {
    return (
      <Alert tone="error" title="Targets could not be loaded">
        <p>{error}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => void refresh()}
        >
          Try again
        </Button>
      </Alert>
    )
  }

  const visibleProfiles = isFounder
    ? data.profiles
    : data.profiles.filter((person) => person.id === profile?.id)
  const displayMonth = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T00:00:00`))
  const remove = async (id: string) => {
    if (!window.confirm('Delete this target permanently?')) return
    setActionError(null)
    try {
      await deleteTarget(id)
      toast({ title: 'Target deleted.', tone: 'success' })
      await refresh()
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The target could not be deleted.',
      )
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Weekly and monthly focus"
        title="Targets"
        description={
          isFounder
            ? 'Set operational sales targets for either CRM user and track actual stage events.'
            : 'See your weekly and monthly target progress from recorded CRM activity.'
        }
        action={
          <Input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="w-auto"
            aria-label="Target month"
          />
        }
      />
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {visibleProfiles.map((person) => {
          const targets = data.targets.filter((target) => target.user_id === person.id)
          return (
            <Card key={person.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-bold text-slate-950">{person.full_name}</h2>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge tone={person.role === 'founder' ? 'violet' : 'teal'}>
                      {person.role === 'founder' ? 'Founder' : 'Lead Generator'}
                    </Badge>
                    <span className="text-xs text-slate-400">{displayMonth}</span>
                  </div>
                </div>
                {isFounder && person.account_status === 'active' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing({ person })}
                  >
                    Add target
                  </Button>
                ) : person.account_status === 'disabled' ? (
                  <Badge tone="red">Access disabled</Badge>
                ) : null}
              </div>
              {targets.length ? (
                <div className="mt-4 space-y-3">
                  {targets.map((target) => {
                    const progress = calculateTargetProgress(target, data.leads)
                    return (
                      <div
                        key={target.id}
                        className="rounded-lg border border-slate-200 p-3.5"
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                              {TARGET_TYPE_LABELS[target.target_type]}
                              <span
                                title={targetFormulas[target.target_type]}
                                aria-label={targetFormulas[target.target_type]}
                                tabIndex={0}
                                className="inline-flex size-4 cursor-help items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500"
                              >
                                ?
                              </span>
                            </p>
                            <p className="text-xs text-slate-400">
                              {target.period_type} · {target.start_date} to{' '}
                              {target.end_date}
                            </p>
                          </div>
                          {isFounder ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="text-xs font-semibold text-blue-700"
                                onClick={() => setEditing({ person, target })}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="text-xs font-semibold text-red-600"
                                onClick={() => void remove(target.id)}
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <ProgressBar value={progress.actual} goal={progress.target} />
                        <p className="mt-2 text-xs text-slate-500">
                          {progress.percentage == null
                            ? 'Not enough data'
                            : `${progress.percentage.toFixed(1)}% complete`}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState
                    title="No targets in this period"
                    description={
                      isFounder
                        ? `Add a weekly or monthly sales target for ${person.full_name}.`
                        : 'Noor has not set your goals for this period yet.'
                    }
                  />
                </div>
              )}
            </Card>
          )
        })}
      </div>
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing?.target
            ? `Edit target for ${editing.person.full_name}`
            : editing
              ? `Add target for ${editing.person.full_name}`
              : 'Target'
        }
        description={displayMonth}
      >
        {editing ? (
          <TargetEditor
            key={`${editing.person.id}-${editing.target?.id ?? 'new'}`}
            person={editing.person}
            target={editing.target}
            startDate={startDate}
            endDate={endDate}
            onSaved={async () => {
              setEditing(null)
              await refresh()
            }}
          />
        ) : null}
      </Modal>
    </div>
  )
}
