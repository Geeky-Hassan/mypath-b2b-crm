// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/ui/ToastProvider'
import type { LeadRecord, PipelineStage } from '../types/domain'
import LeadsPage, { LeadDetail } from './LeadsPage'

const founderId = '11111111-1111-4111-8111-111111111111'

const pageMocks = vi.hoisted(() => ({
  role: 'founder' as 'founder' | 'lead_generator',
  data: null as unknown,
  refresh: vi.fn(),
  getAllLeads: vi.fn(),
  downloadLeadExport: vi.fn(),
  addActivity: vi.fn(),
  deleteActivity: vi.fn(),
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: founderId },
    profile: { id: founderId, role: pageMocks.role },
  }),
}))

vi.mock('../hooks/useAsyncData', () => ({
  useAsyncData: () => ({
    data: pageMocks.data,
    loading: false,
    error: null,
    refresh: pageMocks.refresh,
  }),
}))

vi.mock('../services/crm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/crm')>()
  return {
    ...actual,
    getAllLeads: pageMocks.getAllLeads,
    addActivity: pageMocks.addActivity,
    deleteActivity: pageMocks.deleteActivity,
  }
})

vi.mock('../lib/leadExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/leadExport')>()
  return { ...actual, downloadLeadExport: pageMocks.downloadLeadExport }
})

function makeLead(
  id: string,
  stage: PipelineStage,
  history: PipelineStage[] = ['lead_added'],
): LeadRecord {
  return {
    id,
    company_name: id === 'blue' ? 'Blue Orange Wave' : `Company ${id}`,
    website: 'https://blueorangewave.com/',
    country: 'Netherlands',
    region: 'Europe',
    customer_segment: 'Corporate training / workforce learning',
    company_size: '51-200',
    education_offering: 'Workforce education',
    current_lms_or_tools: 'Existing LMS',
    contact_name: 'Captain Tim Lodder, AFNI',
    job_title: 'Captain',
    email: 't.lodder@blueorangewave.com',
    contact_phone: '+4512345678',
    linkedin_url: 'https://linkedin.com/in/tim-lodder',
    decision_maker_status: 'Decision maker',
    main_pain_point: 'Scattered learning systems',
    reason_mypath_is_relevant: 'Consolidated learning',
    current_alternative: 'Manual tools',
    budget_indicator: 'Budget available',
    qualification_score: 9,
    priority: 'high',
    source: 'linkedin',
    owner_id: founderId,
    created_by: founderId,
    current_pipeline_stage: stage,
    lifecycle_status: 'active',
    date_added: '2026-08-01',
    first_contacted_at: '2026-08-02T10:00:00Z',
    last_contacted_at: '2026-08-03T10:00:00Z',
    next_action: 'Schedule discovery',
    next_action_date: '2026-08-20',
    demo_date: '2026-08-21T10:00:00Z',
    proposed_value: 12000,
    expected_close_date: '2026-09-30',
    lost_reason: null,
    notes: 'Important working notes',
    created_at: '2026-08-01T09:00:00Z',
    updated_at: '2026-08-03T10:00:00Z',
    owner: {
      id: founderId,
      full_name: 'Noor Ul Hassan',
      email: 'founder@example.com',
      role: 'founder',
    },
    creator: {
      id: founderId,
      full_name: 'Noor Ul Hassan',
      email: 'founder@example.com',
      role: 'founder',
    },
    activities: [
      {
        id: `activity-${id}`,
        lead_id: id,
        activity_type: 'email',
        activity_date: '2026-08-03T10:00:00Z',
        summary: 'Follow-up sent',
        notes: 'Requested a meeting',
        created_by: founderId,
        created_at: '2026-08-03T10:00:00Z',
        creator: {
          id: founderId,
          full_name: 'Noor Ul Hassan',
          email: 'founder@example.com',
          role: 'founder',
        },
      },
    ],
    stage_history: history.map((newStage, index) => ({
      id: `history-${id}-${index}`,
      lead_id: id,
      previous_stage: index ? history[index - 1] : null,
      new_stage: newStage,
      changed_by: founderId,
      changed_at: `2026-08-0${index + 1}T12:00:00Z`,
      description: newStage === 'qualified' ? 'Qualified after discovery' : 'Lead added',
      follow_up_required: newStage === 'qualified',
      follow_up_date: newStage === 'qualified' ? '2026-08-20' : null,
      actor: {
        id: founderId,
        full_name: 'Noor Ul Hassan',
        email: 'founder@example.com',
        role: 'founder',
      },
    })),
  }
}

const blueLead = makeLead('blue', 'qualified', ['lead_added', 'qualified'])

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <LeadsPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

beforeEach(() => {
  pageMocks.role = 'founder'
  pageMocks.refresh.mockReset().mockResolvedValue(undefined)
  pageMocks.getAllLeads.mockReset().mockResolvedValue([blueLead])
  pageMocks.downloadLeadExport.mockReset().mockResolvedValue(undefined)
  pageMocks.addActivity.mockReset().mockResolvedValue(undefined)
  pageMocks.deleteActivity.mockReset().mockResolvedValue(undefined)
  pageMocks.data = {
    page: { leads: [blueLead], count: 1 },
    profiles: [blueLead.owner],
    settings: { default_currency: 'USD' },
  }
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
  }
})

describe('lead detail drawer', () => {
  it('uses accessible tabs, clickable contact details, and resets to Overview', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const renderDetail = (lead: LeadRecord) => (
      <ToastProvider>
        <LeadDetail
          lead={lead}
          currency="USD"
          currentUserId={founderId}
          isFounder
          onEdit={() => undefined}
          onDelete={() => undefined}
          onRefresh={onRefresh}
        />
      </ToastProvider>
    )
    const view = render(renderDetail(blueLead))

    expect(
      screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen.getByRole('link', { name: blueLead.email ?? '' }).getAttribute('href'),
    ).toBe(`mailto:${blueLead.email}`)
    expect(document.querySelector(`a[href="tel:${blueLead.contact_phone}"]`)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: blueLead.website ?? '' }).getAttribute('target'),
    ).toBe('_blank')
    expect(
      screen
        .getByRole('link', { name: blueLead.linkedin_url ?? '' })
        .getAttribute('href'),
    ).toBe(blueLead.linkedin_url)

    await user.click(screen.getByRole('tab', { name: /Activity/ }))
    expect(screen.getByText('Follow-up sent')).toBeTruthy()
    await user.type(screen.getByLabelText('Summary'), 'Discovery booked')
    await user.click(screen.getByRole('button', { name: 'Add activity' }))
    await waitFor(() => expect(pageMocks.addActivity).toHaveBeenCalledTimes(1))
    expect(pageMocks.addActivity).toHaveBeenCalledWith(
      blueLead.id,
      expect.objectContaining({ summary: 'Discovery booked', activity_type: 'note' }),
      founderId,
    )

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(pageMocks.deleteActivity).toHaveBeenCalledWith('activity-blue'),
    )

    await user.click(screen.getByRole('tab', { name: /Stage history/ }))
    expect(screen.getByText('Qualified after discovery')).toBeTruthy()

    view.rerender(renderDetail(makeLead('next', 'contacted', ['lead_added'])))
    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected'),
      ).toBe('true'),
    )
    expect(screen.getByText('Important working notes')).toBeTruthy()
  })
})

describe('Leads page export and row actions', () => {
  it('renders a plain company name and opens details from the explicit button', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByText('Blue Orange Wave', { selector: 'p' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Blue Orange Wave' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'View details' }))

    expect(await screen.findByRole('heading', { name: 'Blue Orange Wave' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeTruthy()
  })

  it('exports milestone matches while preserving the current non-stage filters', async () => {
    const user = userEvent.setup()
    const contacted = makeLead('contacted', 'contacted', [
      'lead_added',
      'qualified',
      'contacted',
    ])
    const unqualified = makeLead('new', 'lead_added', ['lead_added'])
    pageMocks.getAllLeads.mockResolvedValue([blueLead, contacted, unqualified])
    renderPage()

    await user.type(screen.getByLabelText('Search leads'), 'Blue')
    await user.selectOptions(screen.getByLabelText('Filter by priority'), 'high')
    await user.click(screen.getByRole('button', { name: 'Export leads' }))
    await user.selectOptions(screen.getByLabelText('Pipeline stage'), 'qualified')
    await user.selectOptions(screen.getByLabelText(/^Stage match/), 'reached')
    await user.click(screen.getByRole('button', { name: 'Download ZIP' }))

    await waitFor(() => expect(pageMocks.downloadLeadExport).toHaveBeenCalledTimes(1))
    expect(pageMocks.getAllLeads).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Blue',
        priority: 'high',
        stage: 'all',
        page: 1,
      }),
    )
    expect(pageMocks.downloadLeadExport).toHaveBeenCalledWith([blueLead, contacted])
  })

  it('shows an error instead of downloading an empty export', async () => {
    const user = userEvent.setup()
    pageMocks.getAllLeads.mockResolvedValue([
      makeLead('new', 'lead_added', ['lead_added']),
    ])
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Export leads' }))
    await user.selectOptions(screen.getByLabelText('Pipeline stage'), 'qualified')
    await user.click(screen.getByRole('button', { name: 'Download ZIP' }))

    expect(await screen.findByText(/No leads match these export options/i)).toBeTruthy()
    expect(pageMocks.downloadLeadExport).not.toHaveBeenCalled()
  })

  it('can ignore page filters and export all leads', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Search leads'), 'Filtered search')
    await user.click(screen.getByRole('button', { name: 'Export leads' }))
    await user.selectOptions(screen.getByLabelText(/^Lead scope/), 'all')
    await user.click(screen.getByRole('button', { name: 'Download ZIP' }))

    await waitFor(() => expect(pageMocks.downloadLeadExport).toHaveBeenCalledTimes(1))
    expect(pageMocks.getAllLeads).toHaveBeenCalledWith(
      expect.objectContaining({ search: '', stage: 'all', page: 1 }),
    )
  })

  it('keeps export controls Founder-only', () => {
    pageMocks.role = 'lead_generator'
    renderPage()

    expect(screen.queryByRole('button', { name: 'Export leads' })).toBeNull()
  })
})
