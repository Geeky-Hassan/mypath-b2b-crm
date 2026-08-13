// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import LoginPage, { friendlyAuthError } from './LoginPage'

const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  sessionInterrupted: false,
  signIn: vi.fn(),
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => authState }))

afterEach(cleanup)

describe('login form', () => {
  beforeEach(() => {
    authState.user = null
    authState.sessionInterrupted = false
    authState.signIn.mockReset()
  })

  it('shows client-side validation before calling Supabase', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/^Email/), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
    expect(authState.signIn).not.toHaveBeenCalled()
  })

  it('submits valid credentials and presents a safe authentication error', async () => {
    authState.signIn.mockRejectedValue(new Error('Invalid login credentials'))
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/^Email/), 'lead-generator@example.com')
    await user.type(screen.getByLabelText(/^Password/), 'secret-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(authState.signIn).toHaveBeenCalledWith(
        'lead-generator@example.com',
        'secret-password',
      )
    })
    expect(await screen.findByText('The email or password is incorrect.')).toBeTruthy()
  })

  it('does not expose unknown backend authentication details', () => {
    expect(friendlyAuthError(new Error('internal auth stack details'))).toBe(
      'Sign-in could not be completed. Check your details or contact the CRM administrator.',
    )
  })

  it('clearly distinguishes disabled and unconfirmed accounts', () => {
    expect(friendlyAuthError(new Error('User is banned'))).toBe(
      'The Founder has disabled this account. Ask the Founder to reactivate access.',
    )
    expect(friendlyAuthError(new Error('Email not confirmed'))).toBe(
      'This email is not confirmed. Ask the Founder to reset the login password or reactivate access.',
    )
  })

  it('explains an unexpected session interruption', () => {
    authState.sessionInterrupted = true
    render(
      <MemoryRouter>
        <LoginPage returnTo="/leads" />
      </MemoryRouter>,
    )

    expect(screen.getByText('Your session ended')).toBeTruthy()
    expect(screen.getByText(/return you to the page you were using/i)).toBeTruthy()
  })
})
