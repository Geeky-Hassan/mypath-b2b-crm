// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/ui/ToastProvider'
import type { Profile } from '../types/domain'
import { LeadForm } from './LeadsPage'

const crmMocks = vi.hoisted(() => ({
  getLeadDuplicateCandidates: vi.fn(),
  saveLead: vi.fn(),
}))

vi.mock('../services/crm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/crm')>()
  return {
    ...actual,
    getLeadDuplicateCandidates: crmMocks.getLeadDuplicateCandidates,
    saveLead: crmMocks.saveLead,
  }
})

const userId = '11111111-1111-4111-8111-111111111111'
const profile: Profile = {
  id: userId,
  full_name: 'Sample Lead Generator',
  email: 'lead-generator@example.com',
  role: 'lead_generator',
  job_title: 'Lead Generator',
  responsibilities: null,
  account_status: 'active',
  must_change_password: false,
  created_at: '2026-08-03T00:00:00Z',
  updated_at: '2026-08-03T00:00:00Z',
}

afterEach(cleanup)

describe('lead form', () => {
  beforeEach(() => {
    crmMocks.getLeadDuplicateCandidates.mockReset()
    crmMocks.saveLead.mockReset()
    crmMocks.getLeadDuplicateCandidates.mockResolvedValue([])
    crmMocks.saveLead.mockResolvedValue('lead-1')
  })

  function renderForm(onSaved = vi.fn().mockResolvedValue(undefined)) {
    render(
      <ToastProvider>
        <LeadForm
          profiles={[profile]}
          currentUserId={userId}
          isFounder={false}
          onSaved={onSaved}
          onCancel={() => undefined}
        />
      </ToastProvider>,
    )
    return onSaved
  }

  it('requires a company name before saving', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Add lead' }))

    expect(await screen.findByText('Company name is required.')).toBeTruthy()
    expect(crmMocks.saveLead).not.toHaveBeenCalled()
  })

  it('saves a minimally valid lead with the signed-in user as owner', async () => {
    const user = userEvent.setup()
    const onSaved = renderForm()
    await user.type(screen.getByLabelText(/^Company name/), 'Northstar Learning')
    await user.click(screen.getByRole('button', { name: 'Add lead' }))

    await waitFor(() => expect(crmMocks.saveLead).toHaveBeenCalledTimes(1))
    expect(crmMocks.saveLead).toHaveBeenCalledWith(
      expect.objectContaining({
        company_name: 'Northstar Learning',
        owner_id: userId,
      }),
      userId,
      undefined,
      false,
    )
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('does not expose founder-only deal and pipeline controls', () => {
    renderForm()

    expect(screen.queryByLabelText(/Pipeline stage/i)).toBeNull()
    expect(screen.queryByLabelText(/Proposed value/i)).toBeNull()
    expect(screen.queryByLabelText(/Lifecycle status/i)).toBeNull()
  })
})
