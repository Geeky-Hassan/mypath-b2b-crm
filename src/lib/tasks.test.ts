import { describe, expect, it } from 'vitest'
import { taskDueGroup, taskSummary } from './tasks'
import type { CrmTask } from '../types/domain'

function task(due_date: string, status: CrmTask['status'] = 'todo'): CrmTask {
  return {
    id: due_date + status,
    title: 'Research lead',
    description: null,
    task_type: 'research',
    lead_id: null,
    assigned_to: 'user-1',
    assigned_by: 'founder-1',
    priority: 'medium',
    status,
    due_date,
    completion_note: null,
    completed_at: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

describe('task due-date grouping', () => {
  const now = new Date('2026-08-05T12:00:00')

  it('groups open deadlines without inventing times', () => {
    expect(taskDueGroup(task('2026-08-04'), now)).toBe('overdue')
    expect(taskDueGroup(task('2026-08-05'), now)).toBe('today')
    expect(taskDueGroup(task('2026-08-07'), now)).toBe('this_week')
    expect(taskDueGroup(task('2026-08-10'), now)).toBe('later')
  })

  it('keeps completed and cancelled tasks out of due groups', () => {
    expect(taskDueGroup(task('2026-08-01', 'completed'), now)).toBe('closed')
    expect(taskDueGroup(task('2026-08-01', 'cancelled'), now)).toBe('closed')
  })

  it('summarizes operational task counts', () => {
    expect(
      taskSummary(
        [
          task('2026-08-04'),
          task('2026-08-05', 'in_progress'),
          task('2026-08-07'),
          task('2026-08-01', 'completed'),
        ],
        now,
      ),
    ).toEqual({ open: 3, overdue: 1, today: 1, thisWeek: 1, completed: 1 })
  })
})
