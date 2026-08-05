import { useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  PageHeader,
  PageLoader,
  ProgressBar,
} from '../components/ui'
import { useAsyncData } from '../hooks/useAsyncData'
import { currentMonthValue, formatDateTime, monthBounds } from '../lib/format'
import { calculateTargetProgress } from '../lib/metrics'
import { calculateMemberMetrics } from '../lib/teamMetrics'
import { getAllLeads, getProfiles, getTargets, getTasks } from '../services/crm'
import { TARGET_TYPE_LABELS, type Profile } from '../types/domain'

function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

interface ActivityItem {
  id: string
  date: string
  text: string
}

interface TeamData {
  profiles: Profile[]
  leads: Awaited<ReturnType<typeof getAllLeads>>
  tasks: Awaited<ReturnType<typeof getTasks>>
  targets: Awaited<ReturnType<typeof getTargets>>
}

export default function TeamPage() {
  const [month, setMonth] = useState(currentMonthValue())
  const bounds = monthBounds(month)
  const start = dateOnly(bounds.start)
  const endDate = new Date(bounds.end.valueOf() - 86_400_000)
  const end = dateOnly(endDate)
  const { data, loading, error } = useAsyncData(async () => {
    const [profiles, leads, tasks, targets] = await Promise.all([
      getProfiles(),
      getAllLeads(),
      getTasks(),
      getTargets(start, end),
    ])
    return { profiles, leads, tasks, targets }
  }, `team-${month}`)

  const members = useMemo(
    () =>
      [...(data?.profiles ?? [])].sort((left, right) =>
        left.full_name.localeCompare(right.full_name),
      ),
    [data?.profiles],
  )

  if (loading && !data) return <PageLoader label="Calculating team activity…" />
  if (!data)
    return (
      <Alert tone="error" title="Team activity could not be loaded">
        {error ?? 'No team data was returned.'}
      </Alert>
    )

  return (
    <div className="space-y-5">
      {error ? (
        <Alert tone="warning" title="Latest team activity could not be refreshed">
          {error} The last successfully loaded report remains visible.
        </Alert>
      ) : null}
      <PageHeader
        eyebrow="Founder team visibility"
        title="Team operations"
        description="Review responsibilities, workload, outcomes, and factual CRM activity without scores or rankings."
        action={
          <div className="w-44">
            <Field label="Reporting month">
              <input
                aria-label="Reporting month"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              />
            </Field>
          </div>
        }
      />
      <Alert tone="info" title="How to read this page">
        Leads added use <code>created_by</code>, assigned workload uses task and lead
        assignees, qualification uses the stage actor, and activity uses the person who
        logged it.
      </Alert>
      {!members.length ? (
        <EmptyState
          title="No team profiles found"
          description="Create a Lead Generator from Settings → Users & access."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              data={data}
              start={start}
              end={end}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MemberCard({
  member,
  data,
  start,
  end,
}: {
  member: Profile
  data: TeamData
  start: string
  end: string
}) {
  const memberTasks = data.tasks.filter((task) => task.assigned_to === member.id)
  const targets = data.targets.filter((target) => target.user_id === member.id)
  const metrics = calculateMemberMetrics(
    member.id,
    data.leads,
    data.tasks,
    data.targets,
    start,
    end,
  )
  const recent: ActivityItem[] = [
    ...data.leads.flatMap((lead) =>
      (lead.activities ?? [])
        .filter((activity) => activity.created_by === member.id)
        .map((activity) => ({
          id: `activity-${activity.id}`,
          date: activity.activity_date,
          text: `${activity.activity_type}: ${activity.summary} · ${lead.company_name}`,
        })),
    ),
    ...data.leads.flatMap((lead) =>
      (lead.stage_history ?? [])
        .filter((event) => event.changed_by === member.id)
        .map((event) => ({
          id: `stage-${event.id}`,
          date: event.changed_at,
          text: `Moved ${lead.company_name} to ${event.new_stage.replaceAll('_', ' ')}`,
        })),
    ),
    ...memberTasks.flatMap((task) =>
      (task.events ?? [])
        .filter((event) => event.changed_by === member.id)
        .map((event) => ({
          id: `task-${event.id}`,
          date: event.changed_at,
          text: `${event.event_type.replaceAll('_', ' ')}: ${task.title}`,
        })),
    ),
  ]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 5)

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50/80 to-cyan-50/50 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">{member.full_name}</h2>
            <p className="mt-1 text-xs text-slate-600">
              {member.job_title ||
                (member.role === 'founder' ? 'Founder' : 'Lead Generator')}
            </p>
          </div>
          <Badge tone={member.account_status === 'active' ? 'green' : 'red'}>
            {member.account_status}
          </Badge>
        </div>
        {member.responsibilities ? (
          <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">
            {member.responsibilities}
          </p>
        ) : (
          <p className="mt-3 text-xs italic text-slate-500">
            Responsibilities have not been recorded.
          </p>
        )}
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniMetric label="Assigned leads" value={metrics.assignedLeads} />
          <MiniMetric label="Leads added" value={metrics.leadsAdded} />
          <MiniMetric label="Qualified" value={metrics.qualified} />
          <MiniMetric label="Activities" value={metrics.activities} />
          <MiniMetric label="Open tasks" value={metrics.openTasks} />
          <MiniMetric label="Overdue" value={metrics.overdueTasks} />
          <MiniMetric label="Completed" value={metrics.completedTasks} />
          <MiniMetric label="Targets" value={targets.length || 'None'} />
        </div>
        {targets.length ? (
          <div className="mt-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Current targets
            </h3>
            {targets.map((target) => {
              const progress = calculateTargetProgress(target, data.leads)
              return (
                <div key={target.id}>
                  <div className="mb-1 flex justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-700">
                      {TARGET_TYPE_LABELS[target.target_type]} · {target.period_type}
                    </span>
                    <span className="text-slate-500">
                      {progress.percentage == null
                        ? 'Not enough data'
                        : `${progress.percentage.toFixed(0)}%`}
                    </span>
                  </div>
                  <ProgressBar value={progress.actual} goal={progress.target} />
                </div>
              )
            })}
          </div>
        ) : null}
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Recent factual activity
          </h3>
          {recent.length ? (
            <ol className="mt-3 space-y-3">
              {recent.map((item) => (
                <li key={item.id} className="border-l-2 border-blue-100 pl-3">
                  <p className="text-xs leading-5 text-slate-700">{item.text}</p>
                  <time className="text-[11px] text-slate-400">
                    {formatDateTime(item.date)}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-slate-500">No CRM activity recorded.</p>
          )}
        </div>
      </div>
    </Card>
  )
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  )
}
