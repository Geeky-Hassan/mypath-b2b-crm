import { STAGE_LABELS, type PipelineStage } from '../types/domain'

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value)
  if (Number.isNaN(date.valueOf())) return '\u2014'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '—'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatMoney(value: number | null | undefined, currency = 'USD'): string {
  if (value == null) return '—'
  if (!Number.isFinite(value)) return '\u2014'
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${currency.toUpperCase()} ${value.toLocaleString('en', { maximumFractionDigits: 0 })}`
  }
}

export function stageLabel(stage: PipelineStage): string {
  return STAGE_LABELS[stage]
}

export function currentMonthValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function dateInputValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

export function monthBounds(month: string): { start: Date; end: Date } {
  const [year, monthNumber] = month.split('-').map(Number)
  return {
    start: new Date(year, monthNumber - 1, 1),
    end: new Date(year, monthNumber, 1),
  }
}

export function isWithinMonth(value: string | null, month: string): boolean {
  if (!value) return false
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value)
  const { start, end } = monthBounds(month)
  return date >= start && date < end
}

export function normalizeWebsite(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
}
