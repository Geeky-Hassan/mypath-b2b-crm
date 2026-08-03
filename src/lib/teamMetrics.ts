import { calculateTargetProgress } from './metrics'
import { taskDueGroup } from './tasks'
import type { CrmTask, LeadRecord, Target } from '../types/domain'

function inRange(value: string | null | undefined, start: string, end: string): boolean {
  const date = value?.slice(0, 10) ?? ''
  return date >= start && date <= end
}

export function calculateMemberMetrics(
  memberId: string,
  leads: LeadRecord[],
  tasks: CrmTask[],
  targets: Target[],
  start: string,
  end: string,
) {
  const memberTasks = tasks.filter((task) => task.assigned_to === memberId)
  const memberTargets = targets.filter((target) => target.user_id === memberId)
  return {
    assignedLeads: leads.filter(
      (lead) => lead.owner_id === memberId && lead.lifecycle_status !== 'archived',
    ).length,
    leadsAdded: leads.filter(
      (lead) => lead.created_by === memberId && inRange(lead.created_at, start, end),
    ).length,
    qualified: leads.filter((lead) =>
      lead.stage_history?.some(
        (event) =>
          event.changed_by === memberId &&
          event.new_stage === 'qualified' &&
          inRange(event.changed_at, start, end),
      ),
    ).length,
    activities: leads
      .flatMap((lead) => lead.activities ?? [])
      .filter(
        (activity) =>
          activity.created_by === memberId && inRange(activity.activity_date, start, end),
      ).length,
    openTasks: memberTasks.filter(
      (task) => task.status === 'todo' || task.status === 'in_progress',
    ).length,
    overdueTasks: memberTasks.filter((task) => taskDueGroup(task) === 'overdue').length,
    completedTasks: memberTasks.filter(
      (task) => task.status === 'completed' && inRange(task.completed_at, start, end),
    ).length,
    targetProgress: memberTargets.map((target) => ({
      target,
      progress: calculateTargetProgress(target, leads),
    })),
  }
}
