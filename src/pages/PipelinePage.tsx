import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { canMoveLead } from '../auth/permissions'
import {
  Alert,
  Badge,
  Button,
  Card,
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
import { SynchronizedHorizontalScroll } from '../components/SynchronizedHorizontalScroll'
import { useAsyncData } from '../hooks/useAsyncData'
import { formatDate, formatDateTime, formatMoney, stageLabel } from '../lib/format'
import { missingLeadInformation } from '../lib/metrics'
import {
  getAllLeads,
  getProfiles,
  getSettings,
  markLeadLost,
  moveLeadStage,
} from '../services/crm'
import {
  FUNNEL_LABELS,
  FUNNEL_STAGES,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  PIPELINE_STAGES,
  STAGE_TO_FUNNEL,
  type FunnelStage,
  type LeadRecord,
  type PipelineStage,
} from '../types/domain'

const COMMERCIAL_STAGES: PipelineStage[] = [
  'paid_pilot_proposal_sent',
  'negotiation',
  'paid_pilot_won',
  'recurring_contract_won',
]

const funnelTone: Record<FunnelStage, string> = {
  awareness: 'border-blue-200 bg-blue-50 text-blue-700',
  interest: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  consideration: 'border-violet-200 bg-violet-50 text-violet-700',
  decision: 'border-amber-200 bg-amber-50 text-amber-700',
  action_retention: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

function PipelineCard({
  lead,
  currency,
  busy,
  draggable,
  showFinancials,
  onOpen,
}: {
  lead: LeadRecord
  currency: string
  busy: boolean
  draggable: boolean
  showFinancials: boolean
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
    disabled: busy || !draggable,
  })
  const currentHistory = lead.stage_history?.find(
    (event) => event.new_stage === lead.current_pipeline_stage,
  )
  return (
    <Card
      ref={setNodeRef}
      className={`p-3.5 ${isDragging ? 'opacity-30' : ''}`}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 text-left"
          aria-label={`Open ${lead.company_name}`}
        >
          <h3 className="truncate text-sm font-bold text-slate-900 hover:text-blue-700">
            {lead.company_name}
          </h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {lead.contact_name || lead.customer_segment || 'No contact yet'}
          </p>
        </button>
        <button
          type="button"
          disabled={busy || !draggable}
          className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md border border-blue-100 text-sm font-bold text-slate-400 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={
            draggable
              ? `Drag ${lead.company_name} to another pipeline stage`
              : `${lead.company_name} cannot be moved by your role`
          }
          {...listeners}
          {...attributes}
        >
          ⋮⋮
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-2.5">
        {showFinancials ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Value</p>
            <p className="text-xs font-semibold text-slate-700">
              {formatMoney(lead.proposed_value, currency)}
            </p>
          </div>
        ) : (
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Qualification
          </p>
        )}
        <LeadReadinessBadge lead={lead} />
      </div>
      <p
        className="mt-2.5 line-clamp-2 text-[10px] leading-4 text-slate-600"
        title={currentHistory?.description ?? undefined}
      >
        {currentHistory?.description || 'No context recorded for this stage.'}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-slate-500">
        <span className="truncate">{lead.owner?.full_name ?? 'Unassigned'}</span>
        <span className="shrink-0">Since {formatDate(currentHistory?.changed_at)}</span>
      </div>
      {currentHistory?.follow_up_required ? (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-800">
          Follow-up: {formatDate(currentHistory.follow_up_date)}
        </p>
      ) : null}
    </Card>
  )
}

function StageColumn({
  stage,
  leads,
  currency,
  busyLead,
  dropEnabled,
  showFinancials,
  canDragLead,
  onOpen,
}: {
  stage: PipelineStage
  leads: LeadRecord[]
  currency: string
  busyLead: string | null
  dropEnabled: boolean
  showFinancials: boolean
  canDragLead: (lead: LeadRecord) => boolean
  onOpen: (lead: LeadRecord) => void
}) {
  const { isOver, setNodeRef } = useDroppable({ id: stage, disabled: !dropEnabled })
  const total = leads.reduce((sum, lead) => sum + (lead.proposed_value ?? 0), 0)
  const funnel = STAGE_TO_FUNNEL[stage]
  return (
    <section aria-labelledby={`stage-${stage}`}>
      <div className="mb-2.5 min-h-16 px-1">
        <span
          className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${funnelTone[funnel]}`}
        >
          {FUNNEL_LABELS[funnel]}
        </span>
        <div className="mt-2 flex items-start justify-between gap-2">
          <div>
            <h2 id={`stage-${stage}`} className="text-xs font-bold text-slate-800">
              {stageLabel(stage)}
            </h2>
            {showFinancials ? (
              <p className="mt-0.5 text-[10px] text-slate-400">
                {formatMoney(total, currency)}
              </p>
            ) : null}
          </div>
          <Badge tone="slate">{leads.length}</Badge>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[420px] space-y-2.5 rounded-lg border-2 p-2.5 transition ${
          isOver ? 'border-blue-400 bg-blue-50/70' : 'border-transparent bg-blue-50/55'
        }`}
      >
        {leads.map((lead) => (
          <PipelineCard
            key={lead.id}
            lead={lead}
            currency={currency}
            busy={busyLead === lead.id}
            draggable={canDragLead(lead)}
            showFinancials={showFinancials}
            onOpen={() => onOpen(lead)}
          />
        ))}
        {!leads.length ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400">
            {dropEnabled ? 'Drop leads here' : 'No leads in this stage'}
          </p>
        ) : null}
      </div>
    </section>
  )
}

function LeadPipelineDetail({
  lead,
  currency,
  isFounder,
  onRequestMove,
  onMarkLost,
}: {
  lead: LeadRecord
  currency: string
  isFounder: boolean
  onRequestMove: (stage: PipelineStage) => void
  onMarkLost: () => void
}) {
  const warnings = missingLeadInformation(lead)
  const [nextStage, setNextStage] = useState<PipelineStage>(lead.current_pipeline_stage)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="teal">{stageLabel(lead.current_pipeline_stage)}</Badge>
        <Badge>{lead.lifecycle_status}</Badge>
        <LeadReadinessBadge lead={lead} />
        {isFounder &&
        lead.lifecycle_status !== 'won' &&
        lead.lifecycle_status !== 'lost' ? (
          <Button className="ml-auto" size="sm" variant="danger" onClick={onMarkLost}>
            Mark lost
          </Button>
        ) : null}
      </div>
      {warnings.length ? (
        <Alert tone="warning" title="Important information is missing">
          This lead can still move forward, but consider adding: {warnings.join(', ')}.
        </Alert>
      ) : null}
      <Card className="space-y-3 p-5">
        <h3 className="font-bold text-slate-950">Move pipeline stage</h3>
        {isFounder ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select
              value={nextStage}
              onChange={(event) => setNextStage(event.target.value as PipelineStage)}
              aria-label="New pipeline stage"
            >
              {PIPELINE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabel(stage)}
                </option>
              ))}
            </Select>
            <Button
              disabled={nextStage === lead.current_pipeline_stage}
              onClick={() => onRequestMove(nextStage)}
            >
              Move lead
            </Button>
          </div>
        ) : lead.current_pipeline_stage === 'lead_added' ? (
          <Button onClick={() => onRequestMove('qualified')}>Mark qualified</Button>
        ) : (
          <p className="text-sm text-slate-500">
            Lead Generators may move a lead only from Lead Added to Qualified.
          </p>
        )}
      </Card>
      <Card className="grid gap-5 p-5 sm:grid-cols-2">
        <Detail label="Contact" value={lead.contact_name} />
        <Detail label="Email" value={lead.email} />
        <Detail label="Owner" value={lead.owner?.full_name} />
        <Detail label="Segment" value={lead.customer_segment} />
        <Detail label="Country" value={lead.country} />
        <Detail label="Source" value={LEAD_SOURCE_LABELS[lead.source]} />
        {isFounder ? (
          <Detail
            label="Proposed value"
            value={formatMoney(lead.proposed_value, currency)}
          />
        ) : null}
        <Detail label="Next action" value={lead.next_action} />
        <Detail label="Next action date" value={formatDate(lead.next_action_date)} />
        <Detail label="Last contacted" value={formatDate(lead.last_contacted_at)} />
      </Card>
      <section>
        <h3 className="font-bold text-slate-950">Notes</h3>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          {lead.notes || 'No notes recorded.'}
        </p>
      </section>
      <section>
        <h3 className="font-bold text-slate-950">Recent activity</h3>
        {lead.activities?.length ? (
          <ol className="mt-3 space-y-3">
            {lead.activities.slice(0, 6).map((activity) => (
              <li key={activity.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge tone="blue">{activity.activity_type}</Badge>
                  <time className="text-xs text-slate-400">
                    {formatDate(activity.activity_date)}
                  </time>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  {activity.summary}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No activities recorded.</p>
        )}
      </section>
      <section>
        <h3 className="font-bold text-slate-950">Stage history</h3>
        {lead.stage_history?.length ? (
          <ol className="mt-3 space-y-3">
            {lead.stage_history.map((event) => (
              <li key={event.id} className="border-l-2 border-blue-200 pl-4 text-sm">
                <p className="font-medium text-slate-800">
                  {event.previous_stage
                    ? `${stageLabel(event.previous_stage)} → `
                    : 'Started at '}
                  {stageLabel(event.new_stage)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {event.actor?.full_name ?? 'CRM user'} ·{' '}
                  {formatDateTime(event.changed_at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                  {event.description || 'No stage context was recorded.'}
                </p>
                {event.follow_up_required ? (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    Follow-up required on {formatDate(event.follow_up_date)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No history recorded.</p>
        )}
      </section>
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

export default function PipelinePage() {
  const { profile } = useAuth()
  const founder = profile?.role === 'founder'
  const { toast } = useToast()
  const [ownerId, setOwnerId] = useState('')
  const [segment, setSegment] = useState('')
  const [source, setSource] = useState('')
  const [country, setCountry] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeLead, setActiveLead] = useState<LeadRecord | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busyLead, setBusyLead] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<{
    lead: LeadRecord
    stage: PipelineStage
    warnings: string[]
  } | null>(null)
  const [proposedValue, setProposedValue] = useState('')
  const [stageDescription, setStageDescription] = useState('')
  const [followUpRequired, setFollowUpRequired] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [lostLead, setLostLead] = useState<LeadRecord | null>(null)
  const [lostReason, setLostReason] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const { data, loading, error, refresh } = useAsyncData(async () => {
    const [leads, settings, profiles] = await Promise.all([
      getAllLeads(),
      getSettings(),
      getProfiles(),
    ])
    return { leads, settings, profiles }
  }, `pipeline-${profile?.id}`)

  const filtered = useMemo(
    () =>
      (data?.leads ?? []).filter((lead) => {
        if (['archived', 'lost'].includes(lead.lifecycle_status)) return false
        if (ownerId && lead.owner_id !== ownerId) return false
        if (segment && lead.customer_segment !== segment) return false
        if (source && lead.source !== source) return false
        if (country && lead.country !== country) return false
        if (startDate && lead.date_added < startDate) return false
        if (endDate && lead.date_added > endDate) return false
        return true
      }),
    [data, ownerId, segment, source, country, startDate, endDate],
  )
  const selected = data?.leads.find((lead) => lead.id === selectedId) ?? null
  const segments = [
    ...new Set((data?.leads ?? []).map((lead) => lead.customer_segment).filter(Boolean)),
  ].sort()
  const countries = [
    ...new Set((data?.leads ?? []).map((lead) => lead.country).filter(Boolean)),
  ].sort()

  const performMove = async (
    lead: LeadRecord,
    stage: PipelineStage,
    details: {
      proposedValue?: number
      description: string
      followUpRequired: boolean
      followUpDate?: string
    },
  ) => {
    if (!canMoveLead(profile?.role, lead.current_pipeline_stage, stage)) {
      setActionError('Your role is not allowed to make that pipeline move.')
      return
    }
    setBusyLead(lead.id)
    setActionError(null)
    try {
      await moveLeadStage(lead.id, stage, details)
      toast({
        title: `Moved ${lead.company_name}.`,
        description: `New stage: ${stageLabel(stage)}.`,
        tone: 'success',
      })
      setPendingMove(null)
      setProposedValue('')
      setStageDescription('')
      setFollowUpRequired(false)
      setFollowUpDate('')
      await refresh()
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The lead could not be moved.',
      )
    } finally {
      setBusyLead(null)
    }
  }

  const onDragStart = (event: DragStartEvent) => {
    setActiveLead(event.active.data.current?.lead as LeadRecord)
  }
  const requestMove = (lead: LeadRecord, stage: PipelineStage) => {
    if (stage === lead.current_pipeline_stage) return
    if (!canMoveLead(profile?.role, lead.current_pipeline_stage, stage)) {
      setActionError('Your role is not allowed to make that pipeline move.')
      return
    }
    const warnings = missingLeadInformation(lead)
    setPendingMove({ lead, stage, warnings })
    setProposedValue(lead.proposed_value?.toString() ?? '')
    setStageDescription('')
    setFollowUpRequired(stage === 'follow_up_required')
    setFollowUpDate(stage === 'follow_up_required' ? (lead.next_action_date ?? '') : '')
  }

  const onDragEnd = (event: DragEndEvent) => {
    setActiveLead(null)
    const lead = event.active.data.current?.lead as LeadRecord | undefined
    const stage = event.over?.id as PipelineStage | undefined
    if (!lead || !stage) return
    requestMove(lead, stage)
  }

  const confirmLost = async () => {
    if (!founder || !lostLead || !lostReason.trim()) return
    setBusyLead(lostLead.id)
    setActionError(null)
    try {
      await markLeadLost(lostLead.id, lostReason)
      toast({ title: `${lostLead.company_name} marked lost.`, tone: 'success' })
      setLostLead(null)
      setLostReason('')
      setSelectedId(null)
      await refresh()
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The lead could not be marked lost.',
      )
    } finally {
      setBusyLead(null)
    }
  }

  if (loading && !data) return <PageLoader label="Building the sales pipeline…" />
  if (!data) {
    return (
      <Alert tone="error" title="Pipeline could not be loaded">
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

  return (
    <div className="space-y-5">
      {error ? (
        <Alert tone="warning" title="Latest pipeline changes could not be refreshed">
          {error} The last successfully loaded board remains visible.
        </Alert>
      ) : null}
      <PageHeader
        eyebrow="Operational sales funnel"
        title="Pipeline"
        description={
          founder
            ? 'Drag leads through 14 detailed stages. Every successful move is recorded in stage history.'
            : 'View the shared funnel and move Lead Added records to Qualified once research is complete.'
        }
      />
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}
      <Card className="grid items-end gap-2 p-3 md:grid-cols-2 xl:grid-cols-7">
        <Select
          value={ownerId}
          onChange={(event) => setOwnerId(event.target.value)}
          aria-label="Filter by owner"
        >
          <option value="">All owners</option>
          {data.profiles.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.full_name}
            </option>
          ))}
        </Select>
        <Select
          value={segment}
          onChange={(event) => setSegment(event.target.value)}
          aria-label="Filter by segment"
        >
          <option value="">All segments</option>
          {segments.map((item) => (
            <option key={item} value={item ?? ''}>
              {item}
            </option>
          ))}
        </Select>
        <Select
          value={source}
          onChange={(event) => setSource(event.target.value)}
          aria-label="Filter by source"
        >
          <option value="">All sources</option>
          {LEAD_SOURCES.map((item) => (
            <option key={item} value={item}>
              {LEAD_SOURCE_LABELS[item]}
            </option>
          ))}
        </Select>
        <Select
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          aria-label="Filter by country"
        >
          <option value="">All countries</option>
          {countries.map((item) => (
            <option key={item} value={item ?? ''}>
              {item}
            </option>
          ))}
        </Select>
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
          variant="ghost"
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

      {filtered.length ? (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveLead(null)}
        >
          <SynchronizedHorizontalScroll>
            <div
              className="grid w-max gap-3"
              style={{ gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, 17rem)` }}
            >
              {FUNNEL_STAGES.map((funnel) => {
                const count = PIPELINE_STAGES.filter(
                  (stage) => STAGE_TO_FUNNEL[stage] === funnel,
                ).length
                return (
                  <div
                    key={funnel}
                    className={`rounded-lg border px-3 py-2.5 text-xs font-bold ${funnelTone[funnel]}`}
                    style={{ gridColumn: `span ${count}` }}
                  >
                    {FUNNEL_LABELS[funnel]}
                  </div>
                )
              })}
              {PIPELINE_STAGES.map((stage) => (
                <StageColumn
                  key={stage}
                  stage={stage}
                  leads={filtered.filter((lead) => lead.current_pipeline_stage === stage)}
                  currency={data.settings.default_currency}
                  busyLead={busyLead}
                  dropEnabled={founder || stage === 'qualified'}
                  showFinancials={founder}
                  canDragLead={(lead) =>
                    founder || lead.current_pipeline_stage === 'lead_added'
                  }
                  onOpen={(lead) => setSelectedId(lead.id)}
                />
              ))}
            </div>
          </SynchronizedHorizontalScroll>
          <DragOverlay>
            {activeLead ? (
              <Card className="w-72 p-4 shadow-xl">
                <h3 className="truncate text-sm font-bold text-slate-900">
                  {activeLead.company_name}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {stageLabel(activeLead.current_pipeline_stage)}
                </p>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <EmptyState
          title="No leads match this pipeline view"
          description="Clear filters or add a lead to the shared CRM."
        />
      )}

      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected?.company_name ?? 'Lead detail'}
        description={
          selected
            ? `${stageLabel(selected.current_pipeline_stage)} · ${FUNNEL_LABELS[STAGE_TO_FUNNEL[selected.current_pipeline_stage]]}`
            : undefined
        }
      >
        {selected ? (
          <LeadPipelineDetail
            key={selected.id}
            lead={selected}
            currency={data.settings.default_currency}
            isFounder={founder}
            onRequestMove={(stage) => {
              setSelectedId(null)
              requestMove(selected, stage)
            }}
            onMarkLost={() => {
              setLostLead(selected)
              setLostReason(selected.lost_reason ?? '')
            }}
          />
        ) : null}
      </Drawer>

      <Modal
        open={pendingMove !== null}
        onClose={() => {
          setPendingMove(null)
          setProposedValue('')
          setStageDescription('')
          setFollowUpRequired(false)
          setFollowUpDate('')
        }}
        title={pendingMove ? `Move to ${stageLabel(pendingMove.stage)}` : 'Move lead'}
        description={pendingMove?.lead.company_name}
        size="md"
      >
        {pendingMove ? (
          <div className="space-y-4">
            {pendingMove.warnings.length ? (
              <Alert tone="warning" title="Continue with missing information?">
                This move is allowed, but the lead is missing:{' '}
                {pendingMove.warnings.join(', ')}.
              </Alert>
            ) : null}
            {COMMERCIAL_STAGES.includes(pendingMove.stage) &&
            !(pendingMove.lead.proposed_value && pendingMove.lead.proposed_value > 0) ? (
              <Field
                label="Proposed value"
                required
                hint="Required before proposal, negotiation, or a won stage."
              >
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={proposedValue}
                  onChange={(event) => setProposedValue(event.target.value)}
                />
              </Field>
            ) : null}
            <Field
              label="Stage description"
              required
              hint="Explain what happened and the context needed for the next person reviewing this lead."
            >
              <Textarea
                rows={3}
                value={stageDescription}
                placeholder="Example: Discovery completed; the buyer needs pricing for a 200-user paid pilot."
                onChange={(event) => setStageDescription(event.target.value)}
              />
            </Field>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={followUpRequired}
                  disabled={pendingMove.stage === 'follow_up_required'}
                  onChange={(event) => {
                    setFollowUpRequired(event.target.checked)
                    if (!event.target.checked) setFollowUpDate('')
                  }}
                />
                Follow-up required
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Attach a dated follow-up to this exact stage-history entry.
              </p>
              {followUpRequired ? (
                <div className="mt-3">
                  <Field label="Exact follow-up date" required>
                    <Input
                      type="date"
                      value={followUpDate}
                      onChange={(event) => setFollowUpDate(event.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setPendingMove(null)
                  setStageDescription('')
                  setFollowUpRequired(false)
                  setFollowUpDate('')
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !stageDescription.trim() ||
                  (followUpRequired && !followUpDate) ||
                  (COMMERCIAL_STAGES.includes(pendingMove.stage) &&
                    !(
                      Number(proposedValue) > 0 ||
                      (pendingMove.lead.proposed_value ?? 0) > 0
                    ))
                }
                loading={busyLead === pendingMove.lead.id}
                onClick={() =>
                  void performMove(pendingMove.lead, pendingMove.stage, {
                    proposedValue: proposedValue ? Number(proposedValue) : undefined,
                    description: stageDescription,
                    followUpRequired,
                    followUpDate: followUpDate || undefined,
                  })
                }
              >
                Move lead
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={lostLead !== null}
        onClose={() => {
          setLostLead(null)
          setLostReason('')
        }}
        title="Mark lead as lost"
        description={lostLead?.company_name}
        size="md"
      >
        {lostLead ? (
          <div className="space-y-4">
            <Alert tone="warning">
              The lead stays at its current pipeline stage so drop-off reporting remains
              accurate. A lost reason is required.
            </Alert>
            <Field label="Lost reason" required>
              <Textarea
                rows={4}
                value={lostReason}
                onChange={(event) => setLostReason(event.target.value)}
                placeholder="What prevented this opportunity from progressing?"
              />
            </Field>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setLostLead(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!lostReason.trim()}
                loading={busyLead === lostLead.id}
                onClick={() => void confirmLost()}
              >
                Mark lost
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
