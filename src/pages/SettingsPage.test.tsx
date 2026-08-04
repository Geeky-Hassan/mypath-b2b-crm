// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/ui/ToastProvider'
import type { Profile } from '../types/domain'
import SettingsPage from './SettingsPage'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  runTeamAdminAction: vi.fn(),
}))

const founder: Profile = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Noor Ul Hassan',
  email: 'noor@example.com',
  role: 'founder',
  job_title: 'Founder',
  responsibilities: null,
  account_status: 'active',
  must_change_password: false,
  removed_at: null,
  removed_by: null,
  created_at: '2026-08-03T00:00:00Z',
  updated_at: '2026-08-03T00:00:00Z',
}

const leadGenerator: Profile = {
  ...founder,
  id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Team Member',
  email: 'member@example.com',
  role: 'lead_generator',
  job_title: 'Lead Generator',
}

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: founder.id }, profile: founder }),
}))

vi.mock('../hooks/useAsyncData', () => ({
  useAsyncData: () => ({
    data: {
      settings: {
        id: true,
        organization_name: 'MyPath',
        default_currency: 'USD',
        updated_at: '2026-08-03T00:00:00Z',
        updated_by: founder.id,
      },
      profiles: [founder, leadGenerator],
    },
    loading: false,
    error: null,
    refresh: mocks.refresh,
  }),
}))

vi.mock('../services/crm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/crm')>()
  return { ...actual, runTeamAdminAction: mocks.runTeamAdminAction }
})

afterEach(cleanup)

describe('Founder team-member removal', () => {
  beforeEach(() => {
    mocks.refresh.mockReset().mockResolvedValue(undefined)
    mocks.runTeamAdminAction.mockReset().mockResolvedValue({
      ok: true,
      cleanup: { tasks_deleted: 2, targets_deleted: 1, leads_reassigned: 3 },
    })
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open')
    }
  })

  it('requires exact email confirmation before invoking permanent removal', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('tab', { name: 'Users & access' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    const removeButton = screen.getByRole('button', {
      name: 'Remove member permanently',
    })
    expect(removeButton.hasAttribute('disabled')).toBe(true)

    await user.type(screen.getByRole('textbox'), leadGenerator.email)
    expect(removeButton.hasAttribute('disabled')).toBe(false)

    await user.click(removeButton)
    await waitFor(() =>
      expect(mocks.runTeamAdminAction).toHaveBeenCalledWith({
        action: 'delete_lead_generator',
        user_id: leadGenerator.id,
      }),
    )
    expect(await screen.findByText('Team member permanently removed.')).toBeTruthy()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
})
