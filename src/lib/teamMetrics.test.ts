import { describe, expect, it } from 'vitest'
import { calculateMemberMetrics } from './teamMetrics'
import type { CrmTask, LeadRecord, Target } from '../types/domain'

const member = 'member-1'
const other = 'member-2'

const lead = {
  id: 'lead-1',
  company_name: 'Northstar',
  owner_id: member,
  created_by: member,
  lifecycle_status: 'active',
  created_at: '2026-08-03T08:00:00Z',
  activities: [{ id: 'a1', created_by: member, activity_date: '2026-08-04T08:00:00Z' }],
  stage_history: [
    {
      id: 's1',
      changed_by: member,
      changed_at: '2026-08-05T08:00:00Z',
      new_stage: 'qualified',
    },
  ],
} as LeadRecord

const target = {
  id: 'target-1',
  user_id: member,
  period_type: 'monthly',
  start_date: '2026-08-01',
  end_date: '2026-08-31',
  target_type: 'leads_added',
  target_value: 2,
} as Target

describe('team member metrics', () => {
  it('keeps creator, owner, activity actor, stage actor, and task assignee attribution separate', () => {
    const tasks = [
      {
        id: 'task-1',
        assigned_to: member,
        status: 'completed',
        completed_at: '2026-08-06T09:00:00Z',
        due_date: '2026-08-05',
      },
    ] as CrmTask[]
    const result = calculateMemberMetrics(
      member,
      [lead],
      tasks,
      [target],
      '2026-08-01',
      '2026-08-31',
    )
    expect(result).toMatchObject({
      assignedLeads: 1,
      leadsAdded: 1,
      qualified: 1,
      activities: 1,
      completedTasks: 1,
    })
    expect(result.targetProgress[0]?.progress).toMatchObject({
      actual: 1,
      target: 2,
      percentage: 50,
    })
  })

  it('does not attribute another actor’s work to the selected member', () => {
    const otherLead = {
      ...lead,
      id: 'lead-2',
      owner_id: other,
      created_by: other,
      activities: [],
      stage_history: [],
    }
    const result = calculateMemberMetrics(
      member,
      [otherLead],
      [],
      [],
      '2026-08-01',
      '2026-08-31',
    )
    expect(result).toMatchObject({
      assignedLeads: 0,
      leadsAdded: 0,
      qualified: 0,
      activities: 0,
    })
  })
})
