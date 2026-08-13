import { describe, expect, it, vi } from 'vitest'
import { SessionUnavailableError, SupabaseRequestError } from '../auth/sessionRecovery'
import {
  CrmAccessUnavailableError,
  friendlyLeadSaveError,
  logCrmError,
} from './crmErrors'

describe('lead persistence errors', () => {
  it('presents actionable messages for session, network, and access failures', () => {
    expect(friendlyLeadSaveError(new SessionUnavailableError())).toContain(
      'session has ended',
    )
    expect(
      friendlyLeadSaveError(new SupabaseRequestError({ message: 'Failed to fetch' }, 0)),
    ).toContain('changes are still in this form')
    expect(
      friendlyLeadSaveError(
        new SupabaseRequestError(
          { code: '42501', message: 'row-level security policy rejected the row' },
          403,
        ),
      ),
    ).toContain('Ask the Founder')
    expect(friendlyLeadSaveError(new CrmAccessUnavailableError())).toContain(
      'Ask the Founder',
    )
  })

  it('does not expose an unknown backend message to the user', () => {
    expect(friendlyLeadSaveError(new Error('sensitive backend details'))).not.toContain(
      'sensitive backend details',
    )
  })

  it('logs diagnostic fields without logging the backend message', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logCrmError(
      'Lead save',
      new SupabaseRequestError(
        { code: '42501', message: 'customer-sensitive backend text' },
        403,
      ),
    )

    expect(consoleError).toHaveBeenCalledWith('Lead save failed', {
      kind: 'access',
      name: 'SupabaseRequestError',
      code: '42501',
      status: 403,
    })
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      'customer-sensitive backend text',
    )
    consoleError.mockRestore()
  })
})
