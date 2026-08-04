import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../auth/AuthContext'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageLoader,
  ProgressBar,
  StatCard,
  Textarea,
} from '../components/ui'
import { useAsyncData } from '../hooks/useAsyncData'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import {
  currentMonthValue,
  dateInputValue,
  formatDate,
  formatMoney,
  monthBounds,
  stageLabel,
} from '../lib/format'
import {
  average,
  calculateAverageTimeInStage,
  calculateBreakdown,
  calculateConversionRates,
  calculateDropOffByStage,
  calculateFunnelCounts,
  calculateLostReasons,
  calculateOverallPaidPilotConversion,
  calculateSalesCycleDays,
  calculateTargetProgress,
  leadReachedStage,
  metricDisplay,
  missingLeadInformation,
  type BreakdownItem,
} from '../lib/metrics'
import { taskSummary } from '../lib/tasks'
import {
  getAllLeads,
  getSalesCostPeriod,
  getSettings,
  getTargets,
  getTasks,
  saveSalesCostPeriod,
} from '../services/crm'
import {
  STAGE_LABELS,
  TARGET_TYPE_LABELS,
  type CrmTask,
  type LeadRecord,
  type Profile,
  type SalesCostPeriod,
} from '../types/domain'

const CHART_COLORS = ['#2563eb', '#06b6d4', '#60a5fa', '#6366f1', '#14b8a6']

function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function weekBounds(now = new Date()): { start: string; end: string } {
  const start = new Date(now)
  const day = start.getDay() || 7
  start.setDate(start.getDate() - day + 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { start: dateOnly(start), end: dateOnly(end) }
}

function inDateRange(value: string, start: string, end: string): boolean {
  const date = value.slice(0, 10)
  return date >= start && date <= end
}

function MetricSectionTitle({ title, help }: { title: string; help: string }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-[13px] font-bold text-slate-950">{title}</h2>
      <span
        title={help}
        aria-label={help}
        tabIndex={0}
        className="inline-flex size-4 cursor-help items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500"
      >
        ?
      </span>
    </div>
  )
}

function CrmGuide({ founder }: { founder: boolean }) {
  const steps = founder
    ? [
        'Review qualified leads',
        'Contact the lead',
        'Update the funnel stage',
        'Add activity and a next action',
        'Record demos and proposals',
        'Close paid pilots',
        'Review funnel leakage and conversion rates',
      ]
    : [
        'Research a qualified lead',
        'Add a complete lead',
        'Set the source and segment',
        'Mark the lead qualified',
        'Assign an owner',
        'Check missing information',
        'Work toward the weekly target',
      ]

  return (
    <Card className="border-blue-100 bg-gradient-to-r from-blue-50/70 to-cyan-50/50 p-4">
      <details>
        <summary className="cursor-pointer text-xs font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          How to use this CRM
        </summary>
        <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
          {founder ? 'Founder workflow' : 'Lead Generator workflow'}
        </p>
        <ol className="mt-3 grid gap-2 text-[11px] text-slate-700 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="font-bold text-blue-700">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  )
}

function BreakdownList({ items }: { items: BreakdownItem[] }) {
  if (!items.length)
    return <p className="py-6 text-center text-xs text-slate-500">Not enough data</p>
  const max = Math.max(...items.map((item) => item.value), 1)
  return (
    <div className="space-y-2.5">
      {items.slice(0, 8).map((item) => (
        <div key={item.name}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate font-medium text-slate-700">{item.name}</span>
            <span className="text-slate-400">{item.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function OperationalList({
  title,
  help,
  leads,
}: {
  title: string
  help: string
  leads: LeadRecord[]
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <MetricSectionTitle title={title} help={help} />
        <Badge tone={leads.length ? 'amber' : 'green'}>{leads.length}</Badge>
      </div>
      {leads.length ? (
        <div className="mt-3 divide-y divide-slate-100">
          {leads.slice(0, 5).map((lead) => (
            <div key={lead.id} className="py-2.5">
              <p className="text-xs font-semibold text-slate-800">{lead.company_name}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {stageLabel(lead.current_pipeline_stage)} ·{' '}
                {lead.owner?.full_name ?? 'Unassigned'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-500">No leads require attention.</p>
      )}
    </Card>
  )
}

function SalesCostPanel({
  period,
  periodStart,
  periodEnd,
  currency,
  userId,
  wonCustomers,
  onSaved,
}: {
  period: SalesCostPeriod | null
  periodStart: string
  periodEnd: string
  currency: string
  userId: string
  wonCustomers: number
  onSaved: () => Promise<void>
}) {
  const [cost, setCost] = useState(period?.sales_cost.toString() ?? '')
  const [notes, setNotes] = useState(period?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cac = period && wonCustomers > 0 ? period.sales_cost / wonCustomers : null
  const save = async () => {
    const value = Number(cost)
    if (!Number.isFinite(value) || value < 0) return
    setSaving(true)
    setError(null)
    try {
      await saveSalesCostPeriod({
        id: period?.id,
        period_start: periodStart,
        period_end: periodEnd,
        sales_cost: value,
        notes,
        created_by: userId,
      })
      await onSaved()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Sales cost could not be saved.',
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card className="p-5">
      <MetricSectionTitle
        title="Sales cost and CAC"
        help="CAC = founder-entered sales cost for this calendar month ÷ customers first moved to Paid Pilot Won or Recurring Contract Won in the same month. It stays blank without both inputs."
      />
      <p className="mt-1 text-xs text-slate-500">
        {periodStart} to {periodEnd} · {wonCustomers} won customer
        {wonCustomers === 1 ? '' : 's'}
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label={`Sales cost (${currency})`}>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </Field>
        <div>
          <p className="text-sm font-medium text-slate-700">Calculated CAC</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {cac == null ? 'Not enough data' : formatMoney(cac, currency)}
          </p>
        </div>
        <div className="sm:col-span-2">
          <Field label="Cost notes">
            <Textarea
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional source or context for this manually entered cost"
            />
          </Field>
        </div>
      </div>
      <Button
        className="mt-4"
        size="sm"
        loading={saving}
        disabled={!cost || Number(cost) < 0}
        onClick={() => void save()}
      >
        Save period cost
      </Button>
    </Card>
  )
}

function FounderDashboard({
  leads,
  currency,
  salesCost,
  periodStart,
  periodEnd,
  userId,
  refresh,
}: {
  leads: LeadRecord[]
  currency: string
  salesCost: SalesCostPeriod | null
  periodStart: string
  periodEnd: string
  userId: string
  refresh: () => Promise<void>
}) {
  const now = new Date()
  const today = dateOnly(now)
  const active = leads.filter((lead) => lead.lifecycle_status !== 'archived')
  const open = active.filter((lead) =>
    ['active', 'nurture'].includes(lead.lifecycle_status),
  )
  const countReached = (stage: Parameters<typeof leadReachedStage>[1]) =>
    active.filter((lead) => leadReachedStage(lead, stage)).length
  const funnel = calculateFunnelCounts(active)
  const sources = calculateBreakdown(active, (lead) => lead.source)
  const segments = calculateBreakdown(active, (lead) => lead.customer_segment)
  const countries = calculateBreakdown(active, (lead) => lead.country)
  const conversions = calculateConversionRates(active)
  const cycleDays = calculateSalesCycleDays(active)
  const averageCycle = average(cycleDays)
  const stageTimes = calculateAverageTimeInStage(active, now)
  const overallConversion = calculateOverallPaidPilotConversion(active)
  const lostReasons = calculateLostReasons(active)
  const dropOff = calculateDropOffByStage(active)
  const activeValue = open.reduce((sum, lead) => sum + (lead.proposed_value ?? 0), 0)
  const currentStageFollowUp = (lead: LeadRecord) =>
    lead.stage_history?.find(
      (event) =>
        event.new_stage === lead.current_pipeline_stage && event.follow_up_required,
    )?.follow_up_date
  const overdue = open.filter(
    (lead) =>
      (lead.next_action_date && lead.next_action_date < today) ||
      Boolean(currentStageFollowUp(lead) && currentStageFollowUp(lead)! < today),
  )
  const repliesWithoutAction = open.filter(
    (lead) =>
      leadReachedStage(lead, 'replied') &&
      !lead.next_action &&
      !lead.next_action_date &&
      !currentStageFollowUp(lead),
  )
  const demosNeedingFollowup = open.filter(
    (lead) =>
      leadReachedStage(lead, 'demo_completed') &&
      (!lead.next_action_date || lead.next_action_date < today) &&
      (!currentStageFollowUp(lead) || currentStageFollowUp(lead)! < today),
  )
  const staleThreshold = now.valueOf() - 7 * 86_400_000
  const stale = open.filter((lead) => {
    const lastActivity = lead.activities?.length
      ? Math.max(
          ...lead.activities.map((activity) =>
            new Date(activity.activity_date).valueOf(),
          ),
        )
      : new Date(lead.created_at).valueOf()
    return lastActivity < staleThreshold
  })
  const wonInCostPeriod = active.filter((lead) =>
    lead.stage_history?.some(
      (event) =>
        ['paid_pilot_won', 'recurring_contract_won'].includes(event.new_stage) &&
        inDateRange(event.changed_at, periodStart, periodEnd),
    ),
  ).length

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total leads"
          value={active.length}
          help="All CRM leads except archived records."
        />
        <StatCard
          label="Qualified leads"
          value={countReached('qualified')}
          help="Leads that reached Qualified or any later detailed stage."
        />
        <StatCard
          label="Leads contacted"
          value={countReached('contacted')}
          help="Leads that reached Contacted or a later stage."
          accent="blue"
        />
        <StatCard
          label="Replies"
          value={countReached('replied')}
          help="Leads that reached Replied or a later stage."
          accent="violet"
        />
        <StatCard
          label="Discovery calls"
          value={countReached('discovery_call_completed')}
          help="Leads that reached Discovery Call Completed or later."
          accent="amber"
        />
        <StatCard
          label="Demos booked"
          value={countReached('demo_booked')}
          help="Leads that reached Demo Booked or later."
        />
        <StatCard
          label="Proposals sent"
          value={countReached('paid_pilot_proposal_sent')}
          help="Leads that reached Paid-Pilot Proposal Sent or later."
          accent="blue"
        />
        <StatCard
          label="Paid pilots won"
          value={countReached('paid_pilot_won')}
          help="Leads that reached Paid Pilot Won or Recurring Contract Won."
          accent="violet"
        />
        <StatCard
          label="Recurring contracts won"
          value={countReached('recurring_contract_won')}
          help="Leads that reached Recurring Contract Won."
          accent="amber"
        />
        <StatCard
          label="Active pipeline value"
          value={formatMoney(activeValue, currency)}
          help="Sum of proposed value for Active or Nurture leads. Missing values contribute zero rather than being estimated."
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <StatCard
          label="Lead-to-paid-pilot conversion"
          value={metricDisplay(overallConversion, '%')}
          detail={`${countReached('paid_pilot_won')} won from ${active.length} leads`}
          help="Paid-pilot-or-later leads ÷ all non-archived leads."
        />
        <StatCard
          label="Average sales cycle"
          value={
            averageCycle == null ? 'Not enough data' : `${averageCycle.toFixed(1)} days`
          }
          detail={`${cycleDays.length} complete cycle${cycleDays.length === 1 ? '' : 's'}`}
          help="Average time from a recorded Lead Added event to the first recorded Paid Pilot Won or Recurring Contract Won event. Incomplete histories are excluded."
          accent="blue"
        />
        <StatCard
          label="Lost opportunities"
          value={active.filter((lead) => lead.lifecycle_status === 'lost').length}
          detail="Lifecycle marked Lost"
          help="Non-archived leads whose separate lifecycle status is Lost."
          accent="amber"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <MetricSectionTitle
            title="Leads by funnel stage"
            help="Current detailed pipeline stage mapped to Awareness, Interest, Consideration, Decision, or Action and Retention."
          />
          <div className="mt-4 h-64">
            {active.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={130}
                    tick={{ fontSize: 12 }}
                  />
                  <RechartsTooltip />
                  <Bar dataKey="value" fill="#2563eb" radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="Not enough data"
                description="Add leads to populate this chart."
              />
            )}
          </div>
        </Card>
        <Card className="p-4">
          <MetricSectionTitle
            title="Leads by source"
            help="Count of non-archived leads grouped by the recorded source value."
          />
          <div className="mt-4 h-64">
            {sources.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sources}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {sources.map((item, index) => (
                      <Cell
                        key={item.name}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="Not enough data"
                description="No lead sources are recorded."
              />
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <MetricSectionTitle
            title="Leads by segment"
            help="Count of non-archived leads grouped by customer segment; blanks appear as Not recorded."
          />
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segments.slice(0, 10)} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={70}
                />
                <YAxis allowDecimals={false} />
                <RechartsTooltip />
                <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <MetricSectionTitle
            title="Leads by country"
            help="Count of non-archived leads grouped by recorded country; blanks appear as Not recorded."
          />
          <div className="mt-4">
            <BreakdownList items={countries} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <MetricSectionTitle
              title="Stage-to-stage conversion"
              help="For leads with a recorded entry into the first stage, the percentage that later recorded entry into the immediately following stage."
            />
          </div>
          <div className="max-h-[440px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Transition</th>
                  <th className="px-4 py-2.5">Converted</th>
                  <th className="px-4 py-2.5">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {conversions.map((item) => (
                  <tr key={item.from}>
                    <td className="px-4 py-2.5 text-slate-700">
                      {stageLabel(item.from)} → {stageLabel(item.to)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {item.converted} / {item.eligible}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">
                      {item.rate == null ? 'Not enough data' : `${item.rate.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <MetricSectionTitle
              title="Average time in each stage"
              help="Average elapsed time between consecutive stage-history events. For an open lead's current stage, time runs through now. Terminal and incomplete intervals are excluded."
            />
          </div>
          <div className="max-h-[440px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Stage</th>
                  <th className="px-4 py-2.5">Average</th>
                  <th className="px-4 py-2.5">Intervals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stageTimes.map((item) => (
                  <tr key={item.stage}>
                    <td className="px-4 py-2.5 text-slate-700">
                      {STAGE_LABELS[item.stage]}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">
                      {item.averageDays == null
                        ? 'Not enough data'
                        : `${item.averageDays.toFixed(1)} days`}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{item.sampleSize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <MetricSectionTitle
            title="Lost-deal reasons"
            help="Lost lifecycle records grouped by the manually entered lost reason. Blank legacy reasons appear as Not recorded."
          />
          <div className="mt-4">
            <BreakdownList items={lostReasons} />
          </div>
        </Card>
        <Card className="p-4">
          <MetricSectionTitle
            title="Drop-off stage"
            help="Lost lifecycle records grouped by the detailed pipeline stage they occupied when marked lost."
          />
          <div className="mt-4">
            <BreakdownList items={dropOff} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OperationalList
          title="Overdue next actions"
          help="Open leads with a next-action date before today."
          leads={overdue}
        />
        <OperationalList
          title="Replies without next action"
          help="Open leads that reached Replied but have neither next-action text nor date."
          leads={repliesWithoutAction}
        />
        <OperationalList
          title="Demos needing follow-up"
          help="Open leads that reached Demo Completed and have no future next-action date."
          leads={demosNeedingFollowup}
        />
        <OperationalList
          title="Stale for seven days"
          help="Open leads whose latest activity is more than seven days old. Leads with no activity use their creation timestamp."
          leads={stale}
        />
      </div>

      <SalesCostPanel
        key={`${salesCost?.id ?? 'new'}-${salesCost?.updated_at ?? ''}`}
        period={salesCost}
        periodStart={periodStart}
        periodEnd={periodEnd}
        currency={currency}
        userId={userId}
        wonCustomers={wonInCostPeriod}
        onSaved={refresh}
      />
    </div>
  )
}

function LeadGeneratorDashboard({
  leads,
  targets,
  profile,
  tasks,
}: {
  leads: LeadRecord[]
  targets: Awaited<ReturnType<typeof getTargets>>
  profile: Profile
  tasks: CrmTask[]
}) {
  const profileId = profile.id
  const week = weekBounds()
  const own = leads.filter(
    (lead) => lead.created_by === profileId && lead.lifecycle_status !== 'archived',
  )
  const assigned = leads.filter(
    (lead) => lead.owner_id === profileId && lead.lifecycle_status !== 'archived',
  )
  const addedThisWeek = own.filter((lead) =>
    inDateRange(lead.created_at, week.start, week.end),
  )
  const qualifiedAdded = addedThisWeek.filter((lead) =>
    leadReachedStage(lead, 'qualified'),
  )
  const weeklyTarget = targets.find(
    (target) =>
      target.period_type === 'weekly' &&
      target.target_type === 'leads_added' &&
      target.start_date <= week.start &&
      target.end_date >= week.end,
  )
  const progress = weeklyTarget ? calculateTargetProgress(weeklyTarget, leads) : null
  const today = dateInputValue()
  const currentTargets = targets.filter(
    (target) =>
      target.user_id === profileId &&
      target.start_date <= today &&
      target.end_date >= today,
  )
  const tasksSummary = taskSummary(tasks)
  const completedCutoff = new Date()
  completedCutoff.setDate(completedCutoff.getDate() - 7)
  const recentlyCompleted = tasks.filter(
    (task) =>
      task.status === 'completed' &&
      task.completed_at != null &&
      new Date(task.completed_at) >= completedCutoff,
  ).length
  const missing = own.filter((lead) =>
    missingLeadInformation(lead).some((field) => field !== 'next action'),
  )
  const countries = calculateBreakdown(own, (lead) => lead.country)
  const segments = calculateBreakdown(own, (lead) => lead.customer_segment)
  const sources = calculateBreakdown(own, (lead) => lead.source)
  const rejected = own.filter(
    (lead) =>
      lead.lifecycle_status === 'lost' && /reject|unqualif/i.test(lead.lost_reason ?? ''),
  )
  const recentActivity = [
    ...leads.flatMap((lead) =>
      (lead.activities ?? [])
        .filter((activity) => activity.created_by === profileId)
        .map((activity) => ({
          id: `lead-${activity.id}`,
          date: activity.activity_date,
          title: lead.company_name,
          detail: `${activity.activity_type} · ${activity.summary}`,
        })),
    ),
    ...tasks.flatMap((task) =>
      (task.events ?? [])
        .filter((event) => event.changed_by === profileId)
        .map((event) => ({
          id: `task-${event.id}`,
          date: event.changed_at,
          title: task.title,
          detail: `Task ${event.event_type.replaceAll('_', ' ')}`,
        })),
    ),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-blue-100">
        <div className="grid gap-3 bg-gradient-to-r from-blue-50/90 via-white to-cyan-50/70 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div>
            <Badge tone="blue">My focus</Badge>
            <h2 className="mt-2 text-base font-bold text-slate-950">
              {profile.job_title || 'Lead Generator'}
            </h2>
            <p className="mt-1 max-w-3xl whitespace-pre-wrap text-xs leading-5 text-slate-600">
              {profile.responsibilities ||
                'Research qualified companies, record complete lead information, qualify strong opportunities, and keep your assigned work current.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <Link to="/leads">
              <Button size="sm">Add lead</Button>
            </Link>
            <Link to="/import">
              <Button size="sm" variant="secondary">
                Bulk import
              </Button>
            </Link>
            <Link to="/tasks">
              <Button size="sm" variant="secondary">
                My tasks
              </Button>
            </Link>
            <Link to="/leads?view=missing">
              <Button size="sm" variant="ghost">
                Missing information
              </Button>
            </Link>
          </div>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Assigned leads"
          value={assigned.length}
          detail="Your current workload"
          help="Active and nurture leads where you are the current owner. This is separate from leads you sourced."
          accent="blue"
          density="compact"
        />
        <StatCard
          label="Weekly lead target"
          value={weeklyTarget ? weeklyTarget.target_value : 'Not enough data'}
          detail={`${week.start} to ${week.end}`}
          help="The Leads Added weekly target assigned to you for the current Monday-to-Sunday period."
          density="compact"
        />
        <StatCard
          label="Leads added this week"
          value={addedThisWeek.length}
          help="Leads you created during the current Monday-to-Sunday period."
          density="compact"
        />
        <StatCard
          label="Qualified leads added"
          value={qualifiedAdded.length}
          help="Leads you created this week that have reached Qualified or later."
          accent="blue"
          density="compact"
        />
        <StatCard
          label="Target completion"
          value={
            progress?.percentage == null
              ? 'Not enough data'
              : `${progress.percentage.toFixed(1)}%`
          }
          detail={
            progress ? `${progress.actual} of ${progress.target}` : 'No weekly target set'
          }
          help="Leads you created this week ÷ your weekly Leads Added target."
          accent="violet"
          density="compact"
        />
        <StatCard
          label="Missing information"
          value={missing.length}
          detail="Across your active lead set"
          help="Your leads missing at least one editable research field: website, contact name, contact email, country, or segment."
          accent="amber"
          density="compact"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tasks overdue"
          value={tasksSummary.overdue}
          help="Open assigned tasks with a due date before today."
          accent="amber"
          density="compact"
        />
        <StatCard
          label="Due today"
          value={tasksSummary.today}
          help="Open assigned tasks due today."
          accent="violet"
          density="compact"
        />
        <StatCard
          label="Due this week"
          value={tasksSummary.thisWeek}
          help="Open assigned tasks due after today through Sunday."
          accent="blue"
          density="compact"
        />
        <StatCard
          label="Recently completed"
          value={recentlyCompleted}
          detail="Last seven days"
          help="Assigned tasks currently marked Completed."
          accent="teal"
          density="compact"
        />
      </div>
      {weeklyTarget ? (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Weekly target progress
          </p>
          <ProgressBar value={progress?.actual ?? 0} goal={weeklyTarget.target_value} />
        </Card>
      ) : null}
      {currentTargets.length ? (
        <Card className="p-4">
          <MetricSectionTitle
            title="My active targets"
            help="Actuals are calculated from leads you created or stage-history events you recorded inside each target period."
          />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {currentTargets.map((target) => {
              const targetProgress = calculateTargetProgress(target, leads)
              return (
                <div
                  key={target.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="mb-2 flex justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-800">
                      {TARGET_TYPE_LABELS[target.target_type]} · {target.period_type}
                    </span>
                    <span className="text-slate-500">
                      {targetProgress.percentage == null
                        ? 'Not enough data'
                        : `${targetProgress.percentage.toFixed(0)}%`}
                    </span>
                  </div>
                  <ProgressBar
                    value={targetProgress.actual}
                    goal={targetProgress.target}
                  />
                </div>
              )
            })}
          </div>
        </Card>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-4">
          <MetricSectionTitle
            title="Leads by country"
            help="Leads you created, grouped by recorded country."
          />
          <div className="mt-4">
            <BreakdownList items={countries} />
          </div>
        </Card>
        <Card className="p-4">
          <MetricSectionTitle
            title="Leads by segment"
            help="Leads you created, grouped by recorded customer segment."
          />
          <div className="mt-4">
            <BreakdownList items={segments} />
          </div>
        </Card>
        <Card className="p-4">
          <MetricSectionTitle
            title="Leads by source"
            help="Leads you created, grouped by recorded source."
          />
          <div className="mt-4">
            <BreakdownList items={sources} />
          </div>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <MetricSectionTitle
              title="Rejected or unqualified"
              help="Your Lost lifecycle leads whose recorded lost reason contains rejected or unqualified. No score threshold is assumed."
            />
            <Badge tone={rejected.length ? 'amber' : 'green'}>{rejected.length}</Badge>
          </div>
          {rejected.length ? (
            <div className="mt-4 divide-y divide-slate-100">
              {rejected.slice(0, 8).map((lead) => (
                <div key={lead.id} className="py-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {lead.company_name}
                  </p>
                  <p className="text-xs text-slate-500">{lead.lost_reason}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-500">No matching leads.</p>
          )}
        </Card>
        <Card className="p-4">
          <MetricSectionTitle
            title="Recent activity"
            help="Your most recent lead activity and assigned-task events."
          />
          {recentActivity.length ? (
            <div className="mt-4 divide-y divide-slate-100">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="py-3">
                  <div className="flex justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">
                      {activity.title}
                    </p>
                    <time className="text-xs text-slate-400">
                      {formatDate(activity.date)}
                    </time>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{activity.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-500">Not enough data</p>
          )}
        </Card>
      </div>
      {missing.length ? (
        <Card className="p-4">
          <MetricSectionTitle
            title="Leads missing required information"
            help="This is a warning list only; it does not block pipeline movement unless the explicit stage requirements apply."
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {missing.slice(0, 10).map((lead) => (
              <div
                key={lead.id}
                className="rounded-lg border border-amber-200 bg-amber-50 p-3"
              >
                <p className="text-sm font-semibold text-amber-950">
                  {lead.company_name}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Missing: {missingLeadInformation(lead).join(', ')}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  )
}

export default function DashboardPage() {
  const { profile, user } = useAuth()
  const isFounder = profile?.role === 'founder'
  const month = currentMonthValue()
  const { start, end } = monthBounds(month)
  const periodStart = dateOnly(start)
  const periodEnd = dateOnly(new Date(end.valueOf() - 86_400_000))
  const { data, loading, error, refresh } = useAsyncData(async () => {
    const [leads, targets, settings, salesCost, tasks] = await Promise.all([
      getAllLeads(),
      getTargets(periodStart, periodEnd),
      isFounder ? getSettings() : Promise.resolve(null),
      isFounder ? getSalesCostPeriod(periodStart, periodEnd) : Promise.resolve(null),
      isFounder ? Promise.resolve([]) : getTasks(),
    ])
    return { leads, targets, settings, salesCost, tasks }
  }, `dashboard-${profile?.id}-${month}`)

  useAutoRefresh(refresh)

  if (loading && !data) return <PageLoader label="Calculating dashboard metrics…" />
  if (error || !data || !profile || !user)
    return (
      <Alert tone="error" title="Dashboard could not be loaded">
        <p>{error ?? 'Your profile is not available.'}</p>
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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={isFounder ? 'Founder sales intelligence' : 'Lead generation overview'}
        title={`Hi, ${profile.full_name.split(' ')[0]}`}
        description={
          isFounder
            ? 'Pipeline health, conversion, and actions that need attention.'
            : "This week's lead progress, targets, and data quality."
        }
        action={
          <div className="flex items-center gap-2">
            <Link to="/analytics">
              <Button variant="secondary">View analytics</Button>
            </Link>
            <Link to="/leads">
              <Button>Add a lead</Button>
            </Link>
          </div>
        }
      />
      <CrmGuide founder={isFounder} />
      {isFounder ? (
        <FounderDashboard
          leads={data.leads}
          currency={data.settings?.default_currency ?? 'USD'}
          salesCost={data.salesCost}
          periodStart={periodStart}
          periodEnd={periodEnd}
          userId={user.id}
          refresh={refresh}
        />
      ) : (
        <LeadGeneratorDashboard
          leads={data.leads}
          targets={data.targets}
          profile={profile}
          tasks={data.tasks}
        />
      )}
    </div>
  )
}
