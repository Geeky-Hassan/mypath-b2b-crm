import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.16)] hover:bg-blue-700 focus-visible:ring-blue-200',
    secondary:
      'border border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 focus-visible:ring-blue-100',
    ghost:
      'text-slate-600 hover:bg-blue-50 hover:text-blue-800 focus-visible:ring-blue-100',
    danger: 'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-200',
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm' ? 'min-h-7 px-2.5 text-[11px]' : 'min-h-9 px-3.5 text-[13px]',
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : null}
      {children}
    </button>
  )
}

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border border-slate-200 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.045)]',
          className,
        )}
        {...props}
      />
    )
  },
)

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 min-h-9 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-500 hover:border-blue-300 focus:border-blue-500 focus:ring-3 focus:ring-blue-100 disabled:bg-slate-100',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 min-h-9 w-full min-w-0 truncate rounded-lg border border-slate-300 bg-white px-3 pr-8 text-[13px] text-slate-900 outline-none transition hover:border-blue-300 focus:border-blue-500 focus:ring-3 focus:ring-blue-100 disabled:bg-slate-100',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-500 hover:border-blue-300 focus:border-blue-500 focus:ring-3 focus:ring-blue-100 disabled:bg-slate-100',
        className,
      )}
      {...props}
    />
  )
}

interface FieldProps {
  label: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
}

export function Field({ label, error, hint, required, children }: FieldProps) {
  return (
    <label className="block min-w-0 space-y-1.5 text-[11px] font-semibold text-slate-700">
      <span>
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </span>
      {children}
      {error ? <span className="block text-xs text-red-600">{error}</span> : null}
      {!error && hint ? (
        <span className="block text-[11px] font-normal text-slate-500">{hint}</span>
      ) : null}
    </label>
  )
}

type BadgeTone = 'slate' | 'blue' | 'teal' | 'amber' | 'green' | 'red' | 'violet'

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: BadgeTone
}) {
  const tones: Record<BadgeTone, string> = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-50 text-blue-700',
    teal: 'bg-cyan-50 text-cyan-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    violet: 'bg-violet-50 text-violet-700',
  }
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

export function Alert({
  children,
  tone = 'info',
  title,
}: {
  children: ReactNode
  tone?: 'info' | 'success' | 'error' | 'warning'
  title?: string
}) {
  const tones = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  }
  return (
    <div
      className={cn('rounded-md border px-3.5 py-3 text-[13px]', tones[tone])}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div>{children}</div>
    </div>
  )
}

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'size-4 border-2',
    md: 'size-7 border-[3px]',
    lg: 'size-10 border-4',
  }
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-current border-r-transparent',
        sizes[size],
      )}
      aria-label="Loading"
    />
  )
}

export function PageLoader({ label = 'Loading workspace…' }: { label?: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner />
      <p className="text-sm font-medium">{label}</p>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200', className)} />
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
        MP
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function StatCard({
  label,
  value,
  detail,
  help,
  accent = 'teal',
}: {
  label: string
  value: string | number
  detail?: string
  help?: string
  accent?: 'teal' | 'blue' | 'amber' | 'violet'
}) {
  const accents = {
    teal: 'bg-blue-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    violet: 'bg-violet-500',
  }
  return (
    <Card className="relative overflow-hidden p-4">
      <span
        className={cn('absolute right-4 top-4 size-1.5 rounded-full', accents[accent])}
      />
      <p className="flex items-center gap-1.5 pr-4 text-xs font-semibold text-slate-600">
        {label}
        {help ? (
          <span
            title={help}
            aria-label={help}
            tabIndex={0}
            className="inline-flex size-3.5 cursor-help items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500"
          >
            ?
          </span>
        ) : null}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-[11px] text-slate-500">{detail}</p> : null}
    </Card>
  )
}

export function ProgressBar({ value, goal }: { value: number; goal: number }) {
  const percent = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{value.toLocaleString()} complete</span>
        <span>{goal.toLocaleString()} goal</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.04)]">
      <table className="w-full min-w-[760px] border-collapse text-left text-[13px] [&_td]:align-top [&_th]:whitespace-nowrap [&_th]:font-semibold">
        {children}
      </table>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  size?: 'md' | 'lg' | 'xl'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  if (!open) return null
  const sizes = { md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cn(
        'm-auto max-h-[92vh] w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-[0_24px_60px_rgba(23,32,51,0.18)]',
        sizes[size],
      )}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={onClose}
    >
      <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 id={titleId} className="text-base font-bold text-slate-950">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close modal"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          ×
        </button>
      </div>
      <div className="max-h-[calc(92vh-72px)] overflow-y-auto p-5">{children}</div>
    </dialog>
  )
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-xl border-0 border-l border-slate-200 bg-white p-0 shadow-[0_0_48px_rgba(23,32,51,0.15)]"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={onClose}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-bold text-slate-950">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close drawer"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            &times;
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </dialog>
  )
}
