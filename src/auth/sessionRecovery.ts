import type { Session } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'

const SESSION_REFRESH_MARGIN_MS = 2 * 60 * 1000

type ErrorRecord = Record<string, unknown>

function errorRecord(caught: unknown): ErrorRecord | null {
  return typeof caught === 'object' && caught !== null ? (caught as ErrorRecord) : null
}

function errorText(caught: unknown, key: string): string | null {
  const value = errorRecord(caught)?.[key]
  return typeof value === 'string' ? value : null
}

function errorStatus(caught: unknown): number | null {
  const value = errorRecord(caught)?.status
  return typeof value === 'number' ? value : null
}

export class SessionUnavailableError extends Error {
  constructor() {
    super('The CRM session is no longer available.')
    this.name = 'SessionUnavailableError'
  }
}

export class SupabaseRequestError extends Error {
  readonly code: string | null
  readonly status: number | null

  constructor(caught: unknown, status?: number) {
    super(errorText(caught, 'message') ?? 'The Supabase request failed.')
    this.name = 'SupabaseRequestError'
    this.code = errorText(caught, 'code')
    this.status = status ?? errorStatus(caught)
  }
}

export function toSupabaseRequestError(
  caught: unknown,
  status?: number,
): SupabaseRequestError {
  return caught instanceof SupabaseRequestError
    ? caught
    : new SupabaseRequestError(caught, status)
}

export function isExplicitAuthenticationRejection(caught: unknown): boolean {
  if (caught instanceof SessionUnavailableError) return true
  const status = errorStatus(caught)
  const code = errorText(caught, 'code')?.toUpperCase()
  return status === 401 || code === 'PGRST301'
}

export async function ensureFreshSession(forceRefresh = false): Promise<Session> {
  const auth = getSupabase().auth
  const { data, error } = await auth.getSession()
  if (error || !data.session) throw new SessionUnavailableError()

  const expiresSoon =
    typeof data.session.expires_at === 'number' &&
    data.session.expires_at * 1000 <= Date.now() + SESSION_REFRESH_MARGIN_MS

  if (!forceRefresh && !expiresSoon) return data.session

  const refreshed = await auth.refreshSession()
  if (refreshed.error || !refreshed.data.session) throw new SessionUnavailableError()
  return refreshed.data.session
}

export async function withSessionRecovery<T>(operation: () => Promise<T>): Promise<T> {
  await ensureFreshSession()
  try {
    return await operation()
  } catch (caught) {
    if (!isExplicitAuthenticationRejection(caught)) throw caught
    await ensureFreshSession(true)
    return operation()
  }
}
