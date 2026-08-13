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
  removed_at: null,
  removed_by: null,
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

  it('lets a Lead Generator save next-action fields and use the new sources', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.getByRole('option', { name: 'Google' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'AI' })).toBeTruthy()
    await user.type(screen.getByLabelText(/^Company name/), 'Research Ready')
    await user.selectOptions(screen.getByLabelText('Source'), 'ai')
    await user.type(screen.getByLabelText('Next action'), 'Founder review')
    await user.type(screen.getByLabelText('Next action date'), '2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Add lead' }))

    await waitFor(() => expect(crmMocks.saveLead).toHaveBeenCalledTimes(1))
    expect(crmMocks.saveLead).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ai',
        next_action: 'Founder review',
        next_action_date: '2026-08-10',
      }),
      userId,
      undefined,
      false,
    )
  })

  it('does not expose founder-only deal and pipeline controls', () => {
    renderForm()

    expect(screen.queryByLabelText(/Pipeline stage/i)).toBeNull()
    expect(screen.queryByLabelText(/Proposed value/i)).toBeNull()
    expect(screen.queryByLabelText(/Lifecycle status/i)).toBeNull()
  })

  it('keeps entered values in the form after a network save failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    crmMocks.saveLead.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/^Company name/), 'Unsaved Northstar')
    await user.type(screen.getByLabelText(/^Website/), 'https://northstar.example')
    await user.click(screen.getByRole('button', { name: 'Add lead' }))

    expect(await screen.findByText(/Your changes are still in this form/i)).toBeTruthy()
    expect((screen.getByLabelText(/^Company name/) as HTMLInputElement).value).toBe(
      'Unsaved Northstar',
    )
    expect((screen.getByLabelText(/^Website/) as HTMLInputElement).value).toBe(
      'https://northstar.example',
    )
    expect(crmMocks.saveLead).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('turns structured access errors into a safe actionable message', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    crmMocks.saveLead.mockRejectedValue({
      code: '42501',
      status: 403,
      message: 'new row violates row-level security policy',
    })
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/^Company name/), 'Access Check')
    await user.click(screen.getByRole('button', { name: 'Add lead' }))

    expect(
      await screen.findByText(/Ask the Founder to check Users & access/i),
    ).toBeTruthy()
    expect((screen.getByLabelText(/^Company name/) as HTMLInputElement).value).toBe(
      'Access Check',
    )
    consoleError.mockRestore()
  })
})
