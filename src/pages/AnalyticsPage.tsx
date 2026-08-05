import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
  DataTable,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageLoader,
  Select,
  StatCard,
} from '../components/ui'
import { useAsyncData } from '../hooks/useAsyncData'
import { formatDate, formatDateTime, formatMoney, stageLabel } from '../lib/format'
import {
  average,
  calculateAverageTimeInStage,
  calculateBreakdown,
  calculateConversionRates,
  calculateFunnelCounts,
  calculateSalesCycleDays,
  leadReachedStage,
} from '../lib/metrics'
import { getAllLeads, getProfiles, getSettings } from '../services/crm'
import {
  FUNNEL_LABELS,
  FUNNEL_STAGES,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LIFECYCLE_LABELS,
  PIPELINE_STAGES,
  STAGE_TO_FUNNEL,
  type FunnelStage,
  type LeadRecord,
} from '../types/domain'

const CHART_COLORS = ['#2563eb', '#06b6d4', '#60a5fa', '#6366f1', '#14b8a6']

const funnelStyles: Record<
  FunnelStage,
  { border: string; accent: string; badge: string }
> = {
  awareness: {
    border: 'border-t-blue-500',
    accent: 'text-blue-700',
    badge: 'bg-blue-50 text-blue-700',
  },
  interest: {
    border: 'border-t-sky-500',
    accent: 'text-sky-700',
    badge: 'bg-sky-50 text-sky-700',
  },
  consideration: {
    border: 'border-t-cyan-500',
    accent: 'text-cyan-700',
    badge: 'bg-cyan-50 text-cyan-700',
  },
  decision: {
    border: 'border-t-indigo-500',
    accent: 'text-indigo-700',
    badge: 'bg-indigo-50 text-indigo-700',
  },
  action_retention: {
    border: 'border-t-emerald-500',
    accent: 'text-emerald-700',
    badge: 'bg-emerald-50 text-emerald-700',
  },
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit' }).format(
    new Date(year, month - 1, 1),
  )
}

function trendFor(leads: LeadRecord[]) {
  const months = new Map<string, { month: string; leads: number; moves: number }>()
  for (const lead of leads) {
    const addedKey = lead.date_added.slice(0, 7)
    if (addedKey) {
      const point = months.get(addedKey) ?? { month: addedKey, leads: 0, moves: 0 }
      point.leads += 1
      months.set(addedKey, point)
    }
    for (const event of lead.stage_history ?? []) {
      const moveKey = event.changed_at.slice(0, 7)
      if (!moveKey) continue
      const point = months.get(moveKey) ?? { month: moveKey, leads: 0, moves: 0 }
      point.moves += 1
      months.set(moveKey, point)
    }
  }
  return [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
    .map((point) => ({ ...point, name: monthLabel(point.month) }))
}

function JourneyMap({ leads }: { leads: LeadRecord[] }) {
  return (
    <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-5">
      {FUNNEL_STAGES.map((funnel, funnelIndex) => {
        const stages = PIPELINE_STAGES.filter(
          (stage) => STAGE_TO_FUNNEL[stage] === funnel,
        )
        const current = leads.filter(
          (lead) => STAGE_TO_FUNNEL[lead.current_pipeline_stage] === funnel,
        ).length
        return (
          <div key={funnel} className="relative">
            {funnelIndex < FUNNEL_STAGES.length - 1 ? (
              <span className="absolute -right-2 top-5 z-10 hidden text-slate-300 xl:block">
                →
              </span>
            ) : null}
            <Card className={`border-t-2 p-3 ${funnelStyles[funnel].border}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p
                    className={`text-[9px] font-bold uppercase tracking-[0.14em] ${funnelStyles[funnel].accent}`}
                  >
                    Phase {funnelIndex + 1}
                  </p>
                  <h2 className="mt-0.5 text-xs font-bold text-slate-900">
                    {FUNNEL_LABELS[funnel]}
                  </h2>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${funnelStyles[funnel].badge}`}
                >
                  {current}
                </span>
              </div>
              <div className="mt-2.5 space-y-1.5">
                {stages.map((stage) => {
                  const atStage = leads.filter(
                    (lead) => lead.current_pipeline_stage === stage,
                  ).length
                  const reached = leads.filter((lead) =>
                    leadReachedStage(lead, stage),
                  ).length
                  return (
                    <div
                      key={stage}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-slate-700"
                    >
                      <p
                        className="truncate text-[11px] font-semibold"
                        title={stageLabel(stage)}
                      >
                        {stageLabel(stage)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {atStage} now · {reached} reached
                      </p>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        )
      })}
    </div>
  )
}

export default function AnalyticsPage() {
  const { profile } = useAuth()
  const founder = profile?.role === 'founder'
  const [ownerId, setOwnerId] = useState('')
  const [segment, setSegment] = useState('')
  const [source, setSource] = useState('')
  const [country, setCountry] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const { data, loading, error, refresh } = useAsyncData(async () => {
    const [leads, profiles, settings] = await Promise.all([
      getAllLeads(),
      getProfiles(),
      founder ? getSettings() : Promise.resolve(null),
    ])
    return { leads, profiles, settings }
  }, `analytics-${profile?.id}`)

  const filtered = useMemo(() => {
    if (!data) return []
    return data.leads.filter((lead) => {
      if (lead.lifecycle_status === 'archived') return false
      if (ownerId && lead.owner_id !== ownerId) return false
      if (segment && lead.customer_segment !== segment) return false
      if (source && lead.source !== source) return false
      if (country && lead.country !== country) return false
      if (startDate && lead.date_added < startDate) return false
      if (endDate && lead.date_added > endDate) return false
      return true
    })
  }, [country, data, endDate, ownerId, segment, source, startDate])

  if (loading && !data) return <PageLoader label="Connecting journey analytics…" />
  if (!data)
    return (
      <Alert tone="error" title="Analytics could not be loaded">
        <p>{error ?? 'CRM data is not available.'}</p>
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

  const segments = [
    ...new Set(data.leads.map((lead) => lead.customer_segment).filter(Boolean)),
  ]
    .sort()
    .map(String)
  const countries = [...new Set(data.leads.map((lead) => lead.country).filter(Boolean))]
    .sort()
    .map(String)
  const funnel = calculateFunnelCounts(filtered)
  const sources = calculateBreakdown(filtered, (lead) => LEAD_SOURCE_LABELS[lead.source])
  const lifecycles = calculateBreakdown(
    filtered,
    (lead) => LIFECYCLE_LABELS[lead.lifecycle_status],
  )
  const conversions = calculateConversionRates(filtered)
  const stageTimes = calculateAverageTimeInStage(filtered)
  const salesCycles = calculateSalesCycleDays(filtered)
  const averageCycle = average(salesCycles)
  const trend = trendFor(filtered)
  const moves = filtered.reduce((sum, lead) => sum + (lead.stage_history?.length ?? 0), 0)
  const won = filtered.filter((lead) =>
    ['paid_pilot_won', 'recurring_contract_won'].includes(lead.current_pipeline_stage),
  ).length
  const pipelineValue = filtered
    .filter((lead) => ['active', 'nurture'].includes(lead.lifecycle_status))
    .reduce((sum, lead) => sum + (lead.proposed_value ?? 0), 0)
  const recentMoves = filtered
    .flatMap((lead) =>
      (lead.stage_history ?? []).map((event) => ({
        ...event,
        company: lead.company_name,
        owner: lead.owner?.full_name ?? 'Unassigned',
      })),
    )
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
    .slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const overdue = filtered
    .flatMap((lead) => {
      if (!['active', 'nurture'].includes(lead.lifecycle_status)) return []
      const stageFollowUp = lead.stage_history?.find(
        (event) =>
          event.new_stage === lead.current_pipeline_stage &&
          event.follow_up_required &&
          event.follow_up_date &&
          event.follow_up_date < today,
      )
      const nextActionOverdue =
        lead.next_action_date && lead.next_action_date < today
          ? lead.next_action_date
          : null
      const dueDate = [nextActionOverdue, stageFollowUp?.follow_up_date]
        .filter((value): value is string => Boolean(value))
        .sort()[0]
      if (!dueDate) return []
      return [
        {
          lead,
          dueDate,
          description:
            lead.next_action ||
            stageFollowUp?.description ||
            `Follow up from ${stageLabel(stageFollowUp?.new_stage ?? lead.current_pipeline_stage)}`,
        },
      ]
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 8)

  return (
    <div className="space-y-5">
      {error ? (
        <Alert tone="warning" title="Latest analytics could not be refreshed">
          {error} The last successfully loaded data remains visible.
        </Alert>
      ) : null}
      <PageHeader
        eyebrow="Connected sales intelligence"
        title="Journey analytics"
        description="One view of every lead, movement, conversion, and stage across the complete MyPath sales journey."
        action={
          <Link to="/pipeline">
            <Button>Open pipeline</Button>
          </Link>
        }
      />

      <Card className="grid items-end gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[repeat(4,minmax(8rem,1fr))_minmax(9rem,1fr)_minmax(9rem,1fr)_auto]">
        <Field label="Owner">
          <Select
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            aria-label="Filter analytics by owner"
          >
            <option value="">All owners</option>
            {data.profiles.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Segment">
          <Select
            value={segment}
            onChange={(event) => setSegment(event.target.value)}
            aria-label="Filter analytics by segment"
          >
            <option value="">All segments</option>
            {segments.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source">
          <Select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            aria-label="Filter analytics by source"
          >
            <option value="">All sources</option>
            {LEAD_SOURCES.map((item) => (
              <option key={item} value={item}>
                {LEAD_SOURCE_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country">
          <Select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            aria-label="Filter analytics by country"
          >
            <option value="">All countries</option>
            {countries.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Added from">
          <Input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </Field>
        <Field label="Added to">
          <Input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </Field>
        <Button
          variant="secondary"
          className="h-9 whitespace-nowrap"
          onClick={() => {
            setOwnerId('')
            setSegment('')
            setSource('')
            setCountry('')
            setStartDate('')
            setEndDate('')
          }}
        >
          Clear filters
        </Button>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Leads in view"
          value={filtered.length}
          help="Non-archived leads matching the filters above."
        />
        <StatCard
          label="Recorded stage moves"
          value={moves}
          help="Every stage-history event attached to leads in this view."
          accent="blue"
        />
        <StatCard
          label="Won customers"
          value={won}
          help="Leads currently at Paid Pilot Won or Recurring Contract Won."
          accent="violet"
        />
        <StatCard
          label="Average sales cycle"
          value={
            averageCycle == null ? 'Not enough data' : `${averageCycle.toFixed(1)} days`
          }
          help="Average recorded time from Lead Added to a won stage."
          accent="amber"
        />
        {founder ? (
          <StatCard
            label="Active pipeline value"
            value={formatMoney(pipelineValue, data.settings?.default_currency ?? 'USD')}
            help="Sum of proposed value on Active and Nurture leads. Missing values count as zero."
          />
        ) : (
          <StatCard
            label="Qualified or later"
            value={filtered.filter((lead) => leadReachedStage(lead, 'qualified')).length}
            help="Leads that reached Qualified or any later journey stage."
          />
        )}
      </div>

      <section aria-labelledby="journey-map-title" className="space-y-3">
        <div>
          <Badge tone="blue">All 14 stages</Badge>
          <h2 id="journey-map-title" className="mt-2 text-base font-bold text-slate-950">
            Complete lead journey
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Current placement and historical reach are calculated from each lead and its
            stage history.
          </p>
        </div>
        <JourneyMap leads={filtered} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <div>
            <h2 className="text-sm font-bold text-slate-950">Leads by funnel phase</h2>
            <p className="mt-1 text-xs text-slate-600">
              Current lead placement across the five macro stages.
            </p>
          </div>
          <div className="mt-3 h-64">
            {filtered.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} margin={{ left: 4 }}>
                  <CartesianGrid
                    stroke="#dbeafe"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <RechartsTooltip />
                  <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="Not enough data"
                description="No leads match the selected filters."
              />
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div>
            <h2 className="text-sm font-bold text-slate-950">Lead and movement trend</h2>
            <p className="mt-1 text-xs text-slate-600">
              Recorded lead additions and stage-history events by month.
            </p>
          </div>
          <div className="mt-3 h-64">
            {trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="movesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.26} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="#dbeafe"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <RechartsTooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="leads"
                    name="Leads added"
                    stroke="#2563eb"
                    fill="url(#leadsGradient)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="moves"
                    name="Stage moves"
                    stroke="#06b6d4"
                    fill="url(#movesGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="Not enough data"
                description="Lead and stage-history dates will build this trend."
              />
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div>
            <h2 className="text-sm font-bold text-slate-950">Source mix</h2>
            <p className="mt-1 text-xs text-slate-600">
              Where the leads in this view originated.
            </p>
          </div>
          <div className="mt-3 h-60">
            {sources.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sources}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={3}
                  >
                    {sources.map((item, index) => (
                      <Cell
                        key={item.name}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="Not enough data"
                description="No lead sources are available for this view."
              />
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div>
            <h2 className="text-sm font-bold text-slate-950">Lifecycle health</h2>
            <p className="mt-1 text-xs text-slate-600">
              Lifecycle remains separate from the operational pipeline.
            </p>
          </div>
          <div className="mt-3 h-60">
            {lifecycles.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lifecycles} layout="vertical" margin={{ left: 18 }}>
                  <CartesianGrid
                    stroke="#dbeafe"
                    strokeDasharray="3 3"
                    horizontal={false}
                  />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={72}
                    tick={{ fontSize: 10 }}
                  />
                  <RechartsTooltip />
                  <Bar dataKey="value" fill="#06b6d4" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="Not enough data"
                description="No lifecycle records match this view."
              />
            )}
          </div>
        </Card>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-slate-950">Stage performance</h2>
          <p className="mt-1 text-xs text-slate-600">
            Every journey stage, its current volume, historical reach, conversion, and
            recorded time.
          </p>
        </div>
        <DataTable>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Funnel phase</th>
              <th>Current</th>
              <th>Reached</th>
              <th>Average time</th>
              <th>Next-stage conversion</th>
            </tr>
          </thead>
          <tbody>
            {PIPELINE_STAGES.map((stage, index) => {
              const time = stageTimes[index]
              const conversion = conversions[index]
              return (
                <tr key={stage}>
                  <td className="font-semibold text-slate-800">{stageLabel(stage)}</td>
                  <td>
                    <Badge tone="blue">{FUNNEL_LABELS[STAGE_TO_FUNNEL[stage]]}</Badge>
                  </td>
                  <td>
                    {
                      filtered.filter((lead) => lead.current_pipeline_stage === stage)
                        .length
                    }
                  </td>
                  <td>
                    {filtered.filter((lead) => leadReachedStage(lead, stage)).length}
                  </td>
                  <td>
                    {time.averageDays == null
                      ? 'Not enough data'
                      : `${time.averageDays.toFixed(1)} days`}
                  </td>
                  <td>
                    {conversion?.rate == null
                      ? index === PIPELINE_STAGES.length - 1
                        ? 'Final stage'
                        : 'Not enough data'
                      : `${conversion.rate.toFixed(1)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </DataTable>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-blue-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-950">Latest journey movements</h2>
            <p className="mt-1 text-xs text-slate-600">
              Newest records from stage history.
            </p>
          </div>
          {recentMoves.length ? (
            <div className="divide-y divide-blue-50">
              {recentMoves.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {event.company}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {event.previous_stage
                        ? stageLabel(event.previous_stage)
                        : 'Started'}{' '}
                      → {stageLabel(event.new_stage)}
                    </p>
                    <p className="mt-1 max-w-xl truncate text-[10px] text-slate-600">
                      {event.description || 'No stage context recorded'}
                    </p>
                    {event.follow_up_required ? (
                      <p className="mt-1 text-[10px] font-semibold text-amber-700">
                        Follow-up {formatDate(event.follow_up_date)}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-slate-500">
                      {formatDateTime(event.changed_at)}
                    </p>
                    <p className="mt-0.5 text-[9px] text-slate-400">
                      {event.actor?.full_name ?? event.owner}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="No stage movements"
                description="Moving leads through the pipeline will create this timeline."
              />
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-blue-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-950">Overdue next actions</h2>
            <p className="mt-1 text-xs text-slate-600">
              Active or nurture leads that need operational attention.
            </p>
          </div>
          {overdue.length ? (
            <div className="divide-y divide-blue-50">
              {overdue.map(({ lead, dueDate, description }) => (
                <div
                  key={lead.id}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {lead.company_name}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">
                      {description}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone="red">{formatDate(dueDate)}</Badge>
                    <p className="mt-1 text-[9px] text-slate-400">
                      {lead.owner?.full_name ?? 'Unassigned'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="Nothing overdue"
                description="No matching leads have an overdue next-action date."
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
