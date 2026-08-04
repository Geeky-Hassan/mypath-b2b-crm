import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeadInput } from '../types/domain'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({ from: supabaseMocks.from, rpc: supabaseMocks.rpc }),
}))

import {
  deleteTask,
  importLeadRows,
  moveLeadStage,
  permanentlyDeleteLead,
  setLeadArchived,
} from './crm'

const lead: LeadInput = {
  company_name: ' Northstar Learning ',
  website: ' ',
  email: 'CONTACT@EXAMPLE.COM',
  priority: 'medium',
  source: 'referral',
  owner_id: '11111111-1111-4111-8111-111111111111',
  current_pipeline_stage: 'lead_added',
  lifecycle_status: 'active',
  date_added: '2026-08-03',
}

describe('transactional CSV persistence', () => {
  beforeEach(() => {
    supabaseMocks.from.mockReset()
    supabaseMocks.insert.mockReset()
    supabaseMocks.rpc.mockReset()
    supabaseMocks.from.mockReturnValue({ insert: supabaseMocks.insert })
  })

  it('submits the full import in one database insert', async () => {
    supabaseMocks.insert.mockResolvedValue({ error: null, count: 2 })

    await expect(
      importLeadRows([lead, { ...lead, company_name: 'Second School' }], 'user-1'),
    ).resolves.toBe(2)

    expect(supabaseMocks.from).toHaveBeenCalledTimes(1)
    expect(supabaseMocks.from).toHaveBeenCalledWith('leads')
    expect(supabaseMocks.insert).toHaveBeenCalledTimes(1)
    expect(supabaseMocks.insert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          company_name: 'Northstar Learning',
          website: null,
          email: 'contact@example.com',
          created_by: 'user-1',
        }),
        expect.objectContaining({
          company_name: 'Second School',
          created_by: 'user-1',
        }),
      ],
      { count: 'exact' },
    )
  })

  it('reports a failed batch as importing no rows', async () => {
    supabaseMocks.insert.mockResolvedValue({ error: { message: 'constraint failed' } })

    await expect(importLeadRows([lead], 'user-1')).rejects.toThrow(
      'No rows were imported: constraint failed',
    )
  })

  it('rejects success when the database does not confirm every row', async () => {
    supabaseMocks.insert.mockResolvedValue({ error: null, count: 1 })

    await expect(
      importLeadRows([lead, { ...lead, company_name: 'Second School' }], 'user-1'),
    ).rejects.toThrow('did not confirm the full batch')
  })

  it('does not call Supabase for an empty import', async () => {
    await expect(importLeadRows([], 'user-1')).resolves.toBe(0)
    expect(supabaseMocks.from).not.toHaveBeenCalled()
  })

  it('strips founder-only fields from a Lead Generator import payload', async () => {
    supabaseMocks.insert.mockResolvedValue({ error: null, count: 1 })
    await importLeadRows(
      [
        {
          ...lead,
          current_pipeline_stage: 'negotiation',
          lifecycle_status: 'won',
          proposed_value: 50000,
          expected_close_date: '2026-09-01',
        },
      ],
      'lead-generator-1',
      false,
    )

    const payload = supabaseMocks.insert.mock.calls[0]?.[0][0]
    expect(payload).not.toHaveProperty('current_pipeline_stage')
    expect(payload).not.toHaveProperty('lifecycle_status')
    expect(payload).not.toHaveProperty('proposed_value')
    expect(payload).not.toHaveProperty('expected_close_date')
  })
})

describe('transactional task deletion', () => {
  beforeEach(() => {
    supabaseMocks.rpc.mockReset()
  })

  it('uses the database cleanup function and requires one deleted task', async () => {
    supabaseMocks.rpc.mockResolvedValueOnce({ data: 1, error: null })
    await expect(deleteTask('task-1')).resolves.toBeUndefined()
    expect(supabaseMocks.rpc).toHaveBeenCalledWith('delete_crm_task', {
      p_task_id: 'task-1',
    })

    supabaseMocks.rpc.mockResolvedValueOnce({ data: 0, error: null })
    await expect(deleteTask('task-missing')).rejects.toThrow('already removed')
  })

  it('surfaces a database deletion failure', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    })
    await expect(deleteTask('task-1')).rejects.toEqual({
      message: 'permission denied',
    })
  })
})

describe('contextual pipeline movement', () => {
  beforeEach(() => {
    supabaseMocks.rpc.mockReset()
  })

  it('moves through the transactional function with description and follow-up date', async () => {
    supabaseMocks.rpc.mockResolvedValue({ error: null })

    await moveLeadStage('lead-1', 'follow_up_required', {
      description: 'Buyer requested a revised implementation timeline.',
      followUpRequired: true,
      followUpDate: '2026-08-10',
    })

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('move_lead_with_context', {
      p_lead_id: 'lead-1',
      p_new_stage: 'follow_up_required',
      p_proposed_value: null,
      p_description: 'Buyer requested a revised implementation timeline.',
      p_follow_up_required: true,
      p_follow_up_date: '2026-08-10',
    })
  })

  it('does not send a follow-up date when follow-up is not required', async () => {
    supabaseMocks.rpc.mockResolvedValue({ error: null })

    await moveLeadStage('lead-1', 'qualified', {
      proposedValue: 5000,
      description: '  Qualification confirmed.  ',
      followUpRequired: false,
      followUpDate: '2026-08-10',
    })

    expect(supabaseMocks.rpc).toHaveBeenCalledWith(
      'move_lead_with_context',
      expect.objectContaining({
        p_proposed_value: 5000,
        p_description: 'Qualification confirmed.',
        p_follow_up_required: false,
        p_follow_up_date: null,
      }),
    )
  })
})

describe('founder lead removal', () => {
  beforeEach(() => {
    supabaseMocks.from.mockReset()
    supabaseMocks.update.mockReset()
    supabaseMocks.delete.mockReset()
    supabaseMocks.eq.mockReset()
    supabaseMocks.update.mockReturnValue({ eq: supabaseMocks.eq })
    supabaseMocks.delete.mockReturnValue({ eq: supabaseMocks.eq })
    supabaseMocks.from.mockReturnValue({
      update: supabaseMocks.update,
      delete: supabaseMocks.delete,
    })
  })

  it('verifies that archiving changed exactly one lead', async () => {
    supabaseMocks.eq.mockResolvedValue({ error: null, count: 1 })

    await expect(setLeadArchived('lead-1', true)).resolves.toBeUndefined()

    expect(supabaseMocks.update).toHaveBeenCalledWith(
      { lifecycle_status: 'archived' },
      { count: 'exact' },
    )
    expect(supabaseMocks.eq).toHaveBeenCalledWith('id', 'lead-1')
  })

  it('does not report archive success when RLS changed no row', async () => {
    supabaseMocks.eq.mockResolvedValue({ error: null, count: 0 })

    await expect(setLeadArchived('lead-1', true)).rejects.toThrow(
      'The lead was not archived',
    )
  })

  it('verifies permanent deletion and reports a zero-row rejection', async () => {
    supabaseMocks.eq
      .mockResolvedValueOnce({ error: null, count: 1 })
      .mockResolvedValueOnce({ error: null, count: 0 })

    await expect(permanentlyDeleteLead('lead-1')).resolves.toBeUndefined()
    expect(supabaseMocks.delete).toHaveBeenCalledWith({ count: 'exact' })
    await expect(permanentlyDeleteLead('lead-2')).rejects.toThrow(
      'The lead was not deleted',
    )
  })
})
