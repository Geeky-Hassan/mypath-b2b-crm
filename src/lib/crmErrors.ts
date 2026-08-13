import {
  SessionUnavailableError,
  isExplicitAuthenticationRejection,
} from '../auth/sessionRecovery'

type ErrorRecord = Record<string, unknown>

export class CrmAccessUnavailableError extends Error {
  constructor() {
    super('The CRM record is unavailable or the current account cannot change it.')
    this.name = 'CrmAccessUnavailableError'
  }
}

function errorRecord(caught: unknown): ErrorRecord | null {
  return typeof caught === 'object' && caught !== null ? (caught as ErrorRecord) : null
}

function errorText(caught: unknown, key: string): string {
  const value = errorRecord(caught)?.[key]
  return typeof value === 'string' ? value : ''
}

function errorStatus(caught: unknown): number | null {
  const value = errorRecord(caught)?.status
  return typeof value === 'number' ? value : null
}

function isNetworkFailure(caught: unknown): boolean {
  const message = errorText(caught, 'message').toLowerCase()
  return (
    errorStatus(caught) === 0 ||
    message.includes('failed to fetch') ||
    message.includes('network request') ||
    message.includes('networkerror')
  )
}

function isAccessFailure(caught: unknown): boolean {
  if (caught instanceof CrmAccessUnavailableError) return true
  const status = errorStatus(caught)
  const code = errorText(caught, 'code')
  const message = errorText(caught, 'message').toLowerCase()
  return (
    status === 403 ||
    code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('account is disabled') ||
    message.includes('user is banned')
  )
}

function errorKind(caught: unknown): string {
  if (isExplicitAuthenticationRejection(caught)) return 'authentication'
  if (isNetworkFailure(caught)) return 'network'
  if (isAccessFailure(caught)) return 'access'
  return 'unknown'
}

export function friendlyLeadSaveError(caught: unknown): string {
  if (
    caught instanceof SessionUnavailableError ||
    isExplicitAuthenticationRejection(caught)
  ) {
    return 'Your session has ended. Sign in again to continue. Your lead changes were not saved.'
  }
  if (isNetworkFailure(caught)) {
    return 'The CRM could not reach Supabase. Your changes are still in this form. Check your connection and try again.'
  }
  if (isAccessFailure(caught)) {
    return 'Your CRM access does not allow this change. Ask the Founder to check Users & access.'
  }
  return 'The lead could not be saved. Your changes are still in this form. Try again or contact the CRM administrator.'
}

export function logCrmError(context: string, caught: unknown): void {
  const record = errorRecord(caught)
  console.error(`${context} failed`, {
    kind: errorKind(caught),
    name:
      caught instanceof Error
        ? caught.name
        : typeof record?.name === 'string'
          ? record.name
          : 'UnknownError',
    code: typeof record?.code === 'string' ? record.code : null,
    status: errorStatus(caught),
  })
}
