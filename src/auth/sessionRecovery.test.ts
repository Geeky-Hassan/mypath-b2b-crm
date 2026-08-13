import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({ auth: authMocks }),
}))

import {
  SessionUnavailableError,
  SupabaseRequestError,
  ensureFreshSession,
  withSessionRecovery,
} from './sessionRecovery'

function session(expiresAt: number, accessToken = 'access-token'): Session {
  return {
    access_token: accessToken,
    refresh_token: `refresh-${accessToken}`,
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'generator@example.com',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-08-03T00:00:00Z',
    },
  }
}

describe('session recovery', () => {
  beforeEach(() => {
    vi.useRealTimers()
    authMocks.getSession.mockReset()
    authMocks.refreshSession.mockReset()
  })

  it('uses a valid session without refreshing it', async () => {
    const active = session(Math.floor(Date.now() / 1000) + 3600)
    authMocks.getSession.mockResolvedValue({ data: { session: active }, error: null })

    await expect(ensureFreshSession()).resolves.toBe(active)
    expect(authMocks.refreshSession).not.toHaveBeenCalled()
  })

  it('refreshes a session that is close to expiring', async () => {
    const expiring = session(Math.floor(Date.now() / 1000) + 30, 'expiring')
    const refreshed = session(Math.floor(Date.now() / 1000) + 3600, 'refreshed')
    authMocks.getSession.mockResolvedValue({ data: { session: expiring }, error: null })
    authMocks.refreshSession.mockResolvedValue({
      data: { session: refreshed },
      error: null,
    })

    await expect(ensureFreshSession()).resolves.toBe(refreshed)
    expect(authMocks.refreshSession).toHaveBeenCalledTimes(1)
  })

  it('reports a permanently expired session when refresh is rejected', async () => {
    const expired = session(Math.floor(Date.now() / 1000) - 30, 'expired')
    authMocks.getSession.mockResolvedValue({ data: { session: expired }, error: null })
    authMocks.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Refresh token not found' },
    })

    await expect(ensureFreshSession()).rejects.toBeInstanceOf(SessionUnavailableError)
  })

  it('refreshes and retries exactly once after an explicit 401 rejection', async () => {
    const active = session(Math.floor(Date.now() / 1000) + 3600)
    const refreshed = session(Math.floor(Date.now() / 1000) + 3600, 'refreshed')
    authMocks.getSession.mockResolvedValue({ data: { session: active }, error: null })
    authMocks.refreshSession.mockResolvedValue({
      data: { session: refreshed },
      error: null,
    })
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new SupabaseRequestError({ message: 'JWT expired' }, 401))
      .mockResolvedValueOnce('saved')

    await expect(withSessionRecovery(operation)).resolves.toBe('saved')
    expect(operation).toHaveBeenCalledTimes(2)
    expect(authMocks.refreshSession).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['network failure', new SupabaseRequestError({ message: 'Failed to fetch' }, 0)],
    ['permission failure', new SupabaseRequestError({ message: 'Forbidden' }, 403)],
  ])('does not retry a %s', async (_label, failure) => {
    const active = session(Math.floor(Date.now() / 1000) + 3600)
    authMocks.getSession.mockResolvedValue({ data: { session: active }, error: null })
    const operation = vi.fn().mockRejectedValue(failure)

    await expect(withSessionRecovery(operation)).rejects.toBe(failure)
    expect(operation).toHaveBeenCalledTimes(1)
    expect(authMocks.refreshSession).not.toHaveBeenCalled()
  })
})
