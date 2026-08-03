import { dateInputValue } from './format'
import type { CrmTask } from '../types/domain'

export type DueGroup = 'overdue' | 'today' | 'this_week' | 'later' | 'closed'

function endOfWeek(date: Date): string {
  const result = new Date(date)
  const remaining = 7 - (result.getDay() || 7)
  result.setDate(result.getDate() + remaining)
  return dateInputValue(result)
}

export function taskDueGroup(
  task: Pick<CrmTask, 'due_date' | 'status'>,
  now = new Date(),
): DueGroup {
  if (task.status === 'completed' || task.status === 'cancelled') return 'closed'
  const today = dateInputValue(now)
  if (task.due_date < today) return 'overdue'
  if (task.due_date === today) return 'today'
  if (task.due_date <= endOfWeek(now)) return 'this_week'
  return 'later'
}

export function taskSummary(tasks: CrmTask[], now = new Date()) {
  return {
    open: tasks.filter((task) => task.status === 'todo' || task.status === 'in_progress')
      .length,
    overdue: tasks.filter((task) => taskDueGroup(task, now) === 'overdue').length,
    today: tasks.filter((task) => taskDueGroup(task, now) === 'today').length,
    thisWeek: tasks.filter((task) => taskDueGroup(task, now) === 'this_week').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
  }
}
