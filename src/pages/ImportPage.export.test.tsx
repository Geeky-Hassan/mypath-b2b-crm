// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/ui/ToastProvider'
import type { LeadRecord } from '../types/domain'
import ImportPage from './ImportPage'

const importMocks = vi.hoisted(() => ({
  getAllLeads: vi.fn(),
  downloadLeadExport: vi.fn(),
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'founder-1' },
    profile: { id: 'founder-1', role: 'founder' },
  }),
}))

vi.mock('../hooks/useAsyncData', () => ({
  useAsyncData: () => ({
    data: { profiles: [], duplicateCandidates: [] },
    loading: false,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../services/crm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/crm')>()
  return { ...actual, getAllLeads: importMocks.getAllLeads }
})

vi.mock('../lib/leadExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/leadExport')>()
  return { ...actual, downloadLeadExport: importMocks.downloadLeadExport }
})

const exportLead = { id: 'lead-1', company_name: 'Export Company' } as LeadRecord

afterEach(cleanup)

beforeEach(() => {
  importMocks.getAllLeads.mockReset().mockResolvedValue([exportLead])
  importMocks.downloadLeadExport.mockReset().mockResolvedValue(undefined)
})

describe('Bulk Import rich export', () => {
  it('sends every lead through the shared rich ZIP downloader', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <ImportPage />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Export complete lead data' }))

    await waitFor(() => expect(importMocks.getAllLeads).toHaveBeenCalledWith())
    expect(importMocks.downloadLeadExport).toHaveBeenCalledWith([exportLead])
  })

  it('does not download when there are no leads', async () => {
    const user = userEvent.setup()
    importMocks.getAllLeads.mockResolvedValue([])
    render(
      <ToastProvider>
        <ImportPage />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Export complete lead data' }))

    expect(await screen.findByText('There are no leads to export.')).toBeTruthy()
    expect(importMocks.downloadLeadExport).not.toHaveBeenCalled()
  })
})
