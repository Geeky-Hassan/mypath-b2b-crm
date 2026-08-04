import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
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
  StatCard,
  Textarea,
} from '../components/ui'
import { useToast } from '../components/ui/ToastProvider'
import { useAsyncData } from '../hooks/useAsyncData'
import { dateInputValue, formatDate, formatDateTime } from '../lib/format'
import { taskDueGroup, taskSummary, type DueGroup } from '../lib/tasks'
import {
  deleteTask,
  getAllLeads,
  getProfiles,
  getTasks,
  saveTask,
  updateTaskStatus,
} from '../services/crm'
import {
  LEAD_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  type CrmTask,
  type TaskInput,
  type TaskStatus,
} from '../types/domain'

const taskSchema = z.object({
  title: z.string().trim().min(2, 'Add a clear task title.').max(160),
  description: z.string().trim().max(3000).optional(),
  task_type: z.enum(TASK_TYPES),
  lead_id: z.string().optional(),
  assigned_to: z.string().min(1, 'Choose an assignee.'),
  priority: z.enum(LEAD_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a due date.'),
  completion_note: z.string().trim().max(2000).optional(),
})

type TaskValues = z.infer<typeof taskSchema>

const groupDetails: Array<{
  key: DueGroup
  title: string
  tone: 'red' | 'amber' | 'blue' | 'slate'
}> = [
  { key: 'overdue', title: 'Overdue', tone: 'red' },
  { key: 'today', title: 'Due today', tone: 'amber' },
  { key: 'this_week', title: 'Due this week', tone: 'blue' },
  { key: 'later', title: 'Later', tone: 'slate' },
  { key: 'closed', title: 'Completed or cancelled', tone: 'slate' },
]

function taskDefaults(task: CrmTask | null, assigneeId: string): TaskValues {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    task_type: task?.task_type ?? 'research',
    lead_id: task?.lead_id ?? '',
    assigned_to: task?.assigned_to ?? assigneeId,
    priority: task?.priority ?? 'medium',
    status: task?.status ?? 'todo',
    due_date: task?.due_date ?? dateInputValue(),
    completion_note: task?.completion_note ?? '',
  }
}

function TaskEditor({
  task,
  userId,
  profiles,
  leads,
  onSaved,
  onClose,
}: {
  task: CrmTask | null
  userId: string
  profiles: Awaited<ReturnType<typeof getProfiles>>
  leads: Awaited<ReturnType<typeof getAllLeads>>
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const { toast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const activeProfiles = profiles.filter((profile) => profile.account_status === 'active')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TaskValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: taskDefaults(task, activeProfiles[0]?.id ?? ''),
  })

  const submit = async (values: TaskValues) => {
    setError(null)
    try {
      await saveTask({ ...values, assigned_by: userId } as TaskInput, task?.id)
      toast({ title: task ? 'Task updated.' : 'Task assigned.', tone: 'success' })
      await onSaved()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The task could not be saved.')
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(submit)}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="Task title" required error={errors.title?.message}>
        <Input autoFocus {...register('title')} />
      </Field>
      <Field label="Description" hint="Explain the expected outcome and useful context.">
        <Textarea rows={4} {...register('description')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Task type" required error={errors.task_type?.message}>
          <Select {...register('task_type')}>
            {TASK_TYPES.map((type) => (
              <option key={type} value={type}>
                {TASK_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" required error={errors.priority?.message}>
          <Select {...register('priority')}>
            {LEAD_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority[0].toUpperCase() + priority.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assign to" required error={errors.assigned_to?.message}>
          <Select {...register('assigned_to')}>
            {activeProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name} (
                {profile.role === 'founder' ? 'Founder' : 'Lead Generator'})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" required error={errors.due_date?.message}>
          <Input type="date" {...register('due_date')} />
        </Field>
        <Field
          label="Related lead"
          hint="Optional; general team tasks can stay unlinked."
        >
          <Select {...register('lead_id')}>
            <option value="">No linked lead</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.company_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" required error={errors.status?.message}>
          <Select {...register('status')}>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="Completion note"
        hint="Optional factual outcome when the task is completed."
      >
        <Textarea rows={3} {...register('completion_note')} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {task ? 'Save task' : 'Assign task'}
        </Button>
      </div>
    </form>
  )
}

export default function TasksPage() {
  const { user, profile } = useAuth()
  const isFounder = profile?.role === 'founder'
  const { toast } = useToast()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<CrmTask | null>(null)
  const [selected, setSelected] = useState<CrmTask | null>(null)
  const [statusTask, setStatusTask] = useState<CrmTask | null>(null)
  const [nextStatus, setNextStatus] = useState<TaskStatus>('in_progress')
  const [completionNote, setCompletionNote] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [deletingTask, setDeletingTask] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TaskStatus | 'all'>('all')
  const [assignee, setAssignee] = useState('')
  const { data, loading, error, refresh } = useAsyncData(async () => {
    const [tasks, profiles, leads] = await Promise.all([
      getTasks(),
      getProfiles(),
      getAllLeads(),
    ])
    return { tasks, profiles, leads }
  }, `tasks-${profile?.id}`)

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (data?.tasks ?? []).filter((task) => {
      if (status !== 'all' && task.status !== status) return false
      if (assignee && task.assigned_to !== assignee) return false
      return (
        !needle ||
        `${task.title} ${task.description ?? ''} ${task.lead?.company_name ?? ''}`
          .toLowerCase()
          .includes(needle)
      )
    })
  }, [assignee, data?.tasks, search, status])

  if (loading && !data) return <PageLoader label="Loading team tasks…" />
  if (error || !data || !profile || !user)
    return (
      <Alert tone="error" title="Tasks could not be loaded">
        {error ?? 'Your session is unavailable.'}
      </Alert>
    )

  const summary = taskSummary(data.tasks)
  const requestStatus = (task: CrmTask, value: TaskStatus) => {
    setStatusTask(task)
    setNextStatus(value)
    setCompletionNote(task.completion_note ?? '')
  }
  const changeStatus = async () => {
    if (!statusTask) return
    setSavingStatus(true)
    try {
      await updateTaskStatus(statusTask.id, nextStatus, completionNote)
      toast({
        title: `Task marked ${TASK_STATUS_LABELS[nextStatus].toLowerCase()}.`,
        tone: 'success',
      })
      setStatusTask(null)
      await refresh()
    } catch (caught) {
      toast({
        title: 'Task could not be updated.',
        description: caught instanceof Error ? caught.message : undefined,
        tone: 'error',
      })
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={isFounder ? 'Team operations' : 'My workload'}
        title={isFounder ? 'Tasks' : 'My tasks'}
        description={
          isFounder
            ? 'Assign clear work, connect it to leads when useful, and review factual completion history.'
            : 'Prioritize assigned work by deadline and record a short outcome when you finish.'
        }
        action={
          isFounder ? (
            <Button
              onClick={() => {
                setEditing(null)
                setEditorOpen(true)
              }}
            >
              Assign a task
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Open" value={summary.open} accent="blue" />
        <StatCard label="Overdue" value={summary.overdue} accent="amber" />
        <StatCard label="Due today" value={summary.today} accent="violet" />
        <StatCard label="Due this week" value={summary.thisWeek} accent="teal" />
        <StatCard label="Completed" value={summary.completed} accent="blue" />
      </div>
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_220px_auto]">
          <Input
            aria-label="Search tasks"
            placeholder="Search tasks or linked leads…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            aria-label="Filter task status"
            value={status}
            onChange={(event) => setStatus(event.target.value as TaskStatus | 'all')}
          >
            <option value="all">All statuses</option>
            {TASK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {TASK_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
          {isFounder ? (
            <Select
              aria-label="Filter assignee"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
            >
              <option value="">All team members</option>
              {data.profiles.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
            </Select>
          ) : (
            <div />
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('')
              setStatus('all')
              setAssignee('')
            }}
          >
            Clear filters
          </Button>
        </div>
      </Card>
      {!filtered.length ? (
        <EmptyState
          title="No tasks match this view"
          description={
            isFounder
              ? 'Assign a task or clear the current filters.'
              : 'You have no assigned tasks in this view.'
          }
        />
      ) : (
        groupDetails.map((group) => {
          const groupTasks = filtered.filter((task) => taskDueGroup(task) === group.key)
          if (!groupTasks.length) return null
          return (
            <section key={group.key} aria-labelledby={`task-group-${group.key}`}>
              <div className="mb-2 flex items-center gap-2">
                <h2
                  id={`task-group-${group.key}`}
                  className="text-sm font-bold text-slate-900"
                >
                  {group.title}
                </h2>
                <Badge tone={group.tone}>{groupTasks.length}</Badge>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {groupTasks.map((task) => (
                  <Card key={task.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          className="text-left text-sm font-bold text-slate-900 hover:text-blue-700"
                          onClick={() => setSelected(task)}
                        >
                          {task.title}
                        </button>
                        <p className="mt-1 text-xs text-slate-500">
                          {TASK_TYPE_LABELS[task.task_type]} · Due{' '}
                          {formatDate(task.due_date)}
                          {task.lead ? ` · ${task.lead.company_name}` : ''}
                        </p>
                      </div>
                      <Badge
                        tone={
                          task.priority === 'high'
                            ? 'red'
                            : task.priority === 'low'
                              ? 'slate'
                              : 'blue'
                        }
                      >
                        {task.priority}
                      </Badge>
                    </div>
                    {task.description ? (
                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-600">
                        {task.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <span className="text-xs text-slate-500">
                        {task.assignee?.full_name ?? 'Unknown assignee'} ·{' '}
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                      <div className="flex gap-2">
                        {isFounder ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(task)
                              setEditorOpen(true)
                            }}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {task.status !== 'completed' && task.status !== 'cancelled' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              requestStatus(
                                task,
                                task.status === 'todo' ? 'in_progress' : 'completed',
                              )
                            }
                          >
                            {task.status === 'todo' ? 'Start' : 'Complete'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )
        })
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? 'Edit task' : 'Assign a task'}
        description="Due dates are date-only; add the outcome context in the completion note."
        size="lg"
      >
        <TaskEditor
          key={editing?.id ?? 'new'}
          task={editing}
          userId={user.id}
          profiles={data.profiles}
          leads={data.leads}
          onSaved={refresh}
          onClose={() => setEditorOpen(false)}
        />
      </Modal>
      <Modal
        open={Boolean(statusTask)}
        onClose={() => setStatusTask(null)}
        title="Update task status"
        size="md"
      >
        <div className="space-y-4">
          <Field label="Status">
            <Select
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as TaskStatus)}
            >
              {TASK_STATUSES.filter((value) => isFounder || value !== 'cancelled').map(
                (value) => (
                  <option key={value} value={value}>
                    {TASK_STATUS_LABELS[value]}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field
            label="Completion note"
            hint="Optional; record the factual result or useful handoff context."
          >
            <Textarea
              rows={4}
              value={completionNote}
              onChange={(event) => setCompletionNote(event.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStatusTask(null)}>
              Cancel
            </Button>
            <Button loading={savingStatus} onClick={() => void changeStatus()}>
              Save status
            </Button>
          </div>
        </div>
      </Modal>
      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? 'Task details'}
        description={
          selected
            ? `${TASK_TYPE_LABELS[selected.task_type]} · ${TASK_STATUS_LABELS[selected.status]}`
            : undefined
        }
      >
        {selected ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-semibold text-slate-500">Assignee</p>
                <p className="mt-1 text-slate-900">
                  {selected.assignee?.full_name ?? '—'}
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Due date</p>
                <p className="mt-1 text-slate-900">{formatDate(selected.due_date)}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Priority</p>
                <p className="mt-1 capitalize text-slate-900">{selected.priority}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Related lead</p>
                <p className="mt-1 text-slate-900">
                  {selected.lead?.company_name ?? 'General task'}
                </p>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Description
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {selected.description || 'No description was added.'}
              </p>
            </div>
            {selected.completion_note ? (
              <Alert tone="success" title="Completion note">
                {selected.completion_note}
              </Alert>
            ) : null}
            <div>
              <h3 className="text-sm font-bold text-slate-900">Task history</h3>
              {selected.events?.length ? (
                <ol className="mt-3 space-y-3">
                  {selected.events.map((event) => (
                    <li
                      key={event.id}
                      className="border-l-2 border-blue-100 pl-3 text-xs"
                    >
                      <p className="font-semibold text-slate-800">
                        {event.event_type.replaceAll('_', ' ')}
                      </p>
                      <p className="mt-0.5 text-slate-500">
                        {event.actor?.full_name ?? 'System'} ·{' '}
                        {formatDateTime(event.changed_at)}
                      </p>
                      {event.note ? (
                        <p className="mt-1 text-slate-600">{event.note}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No task events recorded.</p>
              )}
            </div>
            {isFounder ? (
              <div className="border-t border-red-100 pt-4">
                <Button
                  variant="danger"
                  loading={deletingTask}
                  onClick={async () => {
                    if (!window.confirm('Delete this task and its event history?')) return
                    setDeletingTask(true)
                    try {
                      await deleteTask(selected.id)
                      toast({ title: 'Task and history deleted.', tone: 'success' })
                      setSelected(null)
                      await refresh()
                    } catch (caught) {
                      toast({
                        title: 'Task could not be deleted.',
                        description: caught instanceof Error ? caught.message : undefined,
                        tone: 'error',
                      })
                    } finally {
                      setDeletingTask(false)
                    }
                  }}
                >
                  Delete task
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
