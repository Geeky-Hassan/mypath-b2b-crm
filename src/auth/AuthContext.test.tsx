// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { AuthProvider, useAuth } from './AuthContext'
import { ProtectedRoute } from './RouteGuards'

afterEach(cleanup)

const mocks = vi.hoisted(() => ({
  authCallback: null as
    ((event: AuthChangeEvent, session: Session | null) => void) | null,
  single: vi.fn(),
  unsubscribe: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (
        callback: (event: AuthChangeEvent, session: Session | null) => void,
      ) => {
        mocks.authCallback = callback
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
      },
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: mocks.single }),
      }),
    }),
  }),
}))

const profile = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Lead Generator',
  email: 'generator@example.com',
  role: 'lead_generator' as const,
  job_title: null,
  responsibilities: null,
  account_status: 'active' as const,
  must_change_password: false,
  removed_at: null,
  removed_by: null,
  created_at: '2026-08-05T00:00:00Z',
  updated_at: '2026-08-05T00:00:00Z',
}

function session(accessToken: string): Session {
  return {
    access_token: accessToken,
    refresh_token: `refresh-${accessToken}`,
    expires_in: 3600,
    expires_at: 1_800_000_000,
    token_type: 'bearer',
    user: {
      id: profile.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: profile.email,
      app_metadata: {},
      user_metadata: {},
      created_at: profile.created_at,
    },
  }
}

describe('AuthProvider session stability', () => {
  beforeEach(() => {
    mocks.authCallback = null
    mocks.single.mockReset().mockResolvedValue({ data: profile, error: null })
    mocks.unsubscribe.mockReset()
    mocks.signInWithPassword.mockReset()
    mocks.signOut.mockReset().mockResolvedValue({ error: null })
  })

  it('keeps protected content and unsaved input mounted across silent auth events', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/leads']}>
          <ProtectedRoute>
            <label>
              Draft
              <input aria-label="Draft" defaultValue="" />
            </label>
          </ProtectedRoute>
        </MemoryRouter>
      </AuthProvider>,
    )

    act(() => mocks.authCallback?.('INITIAL_SESSION', session('initial-token')))
    const input = await screen.findByLabelText('Draft')
    fireEvent.change(input, { target: { value: 'unsaved research' } })
    await waitFor(() => expect(mocks.single).toHaveBeenCalledTimes(1))

    act(() => {
      mocks.authCallback?.('TOKEN_REFRESHED', session('refreshed-token'))
      mocks.authCallback?.('SIGNED_IN', session('refocused-token'))
    })

    expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe(
      'unsaved research',
    )
    expect(mocks.single).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Opening your CRM…')).toBeNull()
  })
  it('marks an unexpected session termination and clears it after sign-in', async () => {
    function AuthStatus() {
      const { user, sessionInterrupted } = useAuth()
      return (
        <p>
          {user ? 'signed-in' : 'signed-out'} /{' '}
          {sessionInterrupted ? 'interrupted' : 'not-interrupted'}
        </p>
      )
    }

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    )

    act(() => mocks.authCallback?.('INITIAL_SESSION', session('initial-token')))
    await screen.findByText('signed-in / not-interrupted')

    act(() => mocks.authCallback?.('SIGNED_OUT', null))
    expect(screen.getByText('signed-out / interrupted')).toBeTruthy()

    act(() => mocks.authCallback?.('SIGNED_IN', session('new-token')))
    expect(screen.getByText('signed-in / not-interrupted')).toBeTruthy()
  })

  it('does not mark a deliberate sign-out as an interruption', async () => {
    function SignOutControl() {
      const { user, sessionInterrupted, signOut } = useAuth()
      return (
        <div>
          <p>
            {user ? 'signed-in' : 'signed-out'} /{' '}
            {sessionInterrupted ? 'interrupted' : 'not-interrupted'}
          </p>
          <button type="button" onClick={() => void signOut()}>
            Sign out now
          </button>
        </div>
      )
    }

    render(
      <AuthProvider>
        <SignOutControl />
      </AuthProvider>,
    )

    act(() => mocks.authCallback?.('INITIAL_SESSION', session('initial-token')))
    await screen.findByText('signed-in / not-interrupted')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out now' }))

    await screen.findByText('signed-out / not-interrupted')
  })
})
