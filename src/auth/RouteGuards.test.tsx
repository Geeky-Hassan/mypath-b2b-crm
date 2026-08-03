// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { FounderRoute, ProtectedRoute } from './RouteGuards'

const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profile: null as {
    role: 'founder' | 'lead_generator'
    must_change_password?: boolean
  } | null,
  loading: false,
  error: null as string | null,
}))

vi.mock('./AuthContext', () => ({ useAuth: () => authState }))

function LoginDestination() {
  const location = useLocation()
  const state = location.state as { from?: string } | null
  return <p>Login return: {state?.from ?? 'none'}</p>
}

afterEach(cleanup)

describe('route authorization', () => {
  beforeEach(() => {
    authState.user = null
    authState.profile = null
    authState.loading = false
    authState.error = null
  })

  it('redirects unauthenticated users and preserves the complete local route', () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=crm#currency']}>
        <Routes>
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <p>Private settings</p>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginDestination />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Login return: /settings?tab=crm#currency')).toBeTruthy()
  })

  it('blocks founder routes for a lead generator', () => {
    authState.user = { id: 'hiba' }
    authState.profile = { role: 'lead_generator' }
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route
            path="/settings"
            element={
              <FounderRoute>
                <p>Founder settings</p>
              </FounderRoute>
            }
          />
          <Route path="/dashboard" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Dashboard')).toBeTruthy()
  })

  it('allows a founder through a founder route', () => {
    authState.user = { id: 'noor' }
    authState.profile = { role: 'founder' }
    render(
      <MemoryRouter>
        <FounderRoute>
          <p>Founder settings</p>
        </FounderRoute>
      </MemoryRouter>,
    )

    expect(screen.getByText('Founder settings')).toBeTruthy()
  })

  it('blocks normal CRM routes until a temporary password is changed', () => {
    authState.user = { id: 'hiba' }
    authState.profile = { role: 'lead_generator', must_change_password: true }
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <p>Private dashboard</p>
              </ProtectedRoute>
            }
          />
          <Route path="/change-password" element={<p>Change password</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Change password')).toBeTruthy()
  })
})
