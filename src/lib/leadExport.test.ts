import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { LeadRecord, PipelineStage } from '../types/domain'
import {
  buildLeadExportCsvs,
  createLeadExportZip,
  filterLeadsForExport,
  leadExportFilename,
} from './leadExport'
import { parseCsvText } from './csv'

function lead(
  id: string,
  stage: PipelineStage,
  history: PipelineStage[] = [],
): LeadRecord {
  return {
    id,
    company_name:
      id === 'formula' ? '=HYPERLINK("https://bad.example")' : `Company ${id}`,
    website: 'https://example.com',
    country: 'Denmark',
    region: 'Europe',
    customer_segment: 'Corporate learning',
    company_size: '51-200',
    education_offering: 'Workforce learning',
    current_lms_or_tools: 'Existing LMS',
    contact_name: 'Alex Buyer',
    job_title: 'Director',
    email: 'alex@example.com',
    contact_phone: '+4512345678',
    linkedin_url: 'https://linkedin.com/in/alex',
    decision_maker_status: 'yes',
    main_pain_point: 'Fragmented training',
    reason_mypath_is_relevant: 'One shared platform',
    current_alternative: 'Spreadsheets',
    budget_indicator: 'Approved',
    qualification_score: 9,
    priority: 'high',
    source: 'linkedin',
    owner_id: 'owner-1',
    created_by: 'creator-1',
    current_pipeline_stage: stage,
    lifecycle_status: 'active',
    date_added: '2026-08-01',
    first_contacted_at: '2026-08-02T10:00:00Z',
    last_contacted_at: '2026-08-03T10:00:00Z',
    next_action: 'Book follow-up',
    next_action_date: '2026-08-20',
    demo_date: null,
    proposed_value: 12000,
    expected_close_date: '2026-09-30',
    lost_reason: null,
    notes: 'Current lead notes',
    created_at: '2026-08-01T09:00:00Z',
    updated_at: '2026-08-03T10:00:00Z',
    owner: {
      id: 'owner-1',
      full_name: 'Owner Name',
      email: 'owner@example.com',
      role: 'founder',
    },
    creator: {
      id: 'creator-1',
      full_name: 'Creator Name',
      email: 'creator@example.com',
      role: 'lead_generator',
    },
    activities: [
      {
        id: `activity-${id}`,
        lead_id: id,
        activity_type: 'email',
        activity_date: '2026-08-03T10:00:00Z',
        summary: id === 'formula' ? '=SUM(1,1)' : 'Follow-up sent',
        notes: 'Buyer requested details',
        created_by: 'creator-1',
        created_at: '2026-08-03T10:00:00Z',
        creator: {
          id: 'creator-1',
          full_name: 'Creator Name',
          email: 'creator@example.com',
          role: 'lead_generator',
        },
      },
    ],
    stage_history: history.map((newStage, index) => ({
      id: `history-${id}-${index}`,
      lead_id: id,
      previous_stage: index ? history[index - 1] : null,
      new_stage: newStage,
      changed_by: 'owner-1',
      changed_at: `2026-08-0${index + 1}T12:00:00Z`,
      description: `Moved to ${newStage}`,
      follow_up_required: false,
      follow_up_date: null,
      actor: {
        id: 'owner-1',
        full_name: 'Owner Name',
        email: 'owner@example.com',
        role: 'founder',
      },
    })),
  }
}

describe('rich lead export', () => {
  const qualified = lead('qualified', 'qualified', ['lead_added', 'qualified'])
  const contacted = lead('contacted', 'contacted', [
    'lead_added',
    'qualified',
    'contacted',
  ])
  const newLead = lead('new', 'lead_added', ['lead_added'])

  it('supports current-stage, reached-milestone, and all-stage matching', () => {
    const leads = [qualified, contacted, newLead]
    expect(
      filterLeadsForExport(leads, { stage: 'qualified', stageMatch: 'current' }).map(
        (item) => item.id,
      ),
    ).toEqual(['qualified'])
    expect(
      filterLeadsForExport(leads, { stage: 'qualified', stageMatch: 'reached' }).map(
        (item) => item.id,
      ),
    ).toEqual(['qualified', 'contacted'])
    expect(filterLeadsForExport(leads, { stage: 'all', stageMatch: 'current' })).toBe(
      leads,
    )
  })

  it('creates related lead, activity, and stage-history rows', () => {
    const files = buildLeadExportCsvs([qualified])
    const leads = parseCsvText(files['leads.csv'])
    const activities = parseCsvText(files['activities.csv'])
    const history = parseCsvText(files['stage-history.csv'])

    expect(leads.rows).toHaveLength(1)
    expect(leads.rows[0]).toMatchObject({
      id: 'qualified',
      owner_name: 'Owner Name',
      creator_email: 'creator@example.com',
      proposed_value: '12000',
    })
    expect(activities.rows[0]).toMatchObject({
      lead_id: 'qualified',
      activity_id: 'activity-qualified',
      creator_name: 'Creator Name',
    })
    expect(history.rows).toHaveLength(2)
    expect(history.rows[1]).toMatchObject({
      lead_id: 'qualified',
      new_stage: 'qualified',
      actor_email: 'owner@example.com',
    })
  })

  it('keeps headers for empty histories and escapes spreadsheet formulas', () => {
    const files = buildLeadExportCsvs([lead('formula', 'lead_added')])
    expect(files['activities.csv']).toContain("'=SUM(1,1)")
    expect(files['leads.csv']).toContain("'=HYPERLINK")
    expect(parseCsvText(files['stage-history.csv']).headers).toContain('new_stage')
    expect(parseCsvText(files['stage-history.csv']).rows).toEqual([])
  })

  it('packages exactly three BOM-prefixed CSV files in the ZIP', async () => {
    const archive = unzipSync(await createLeadExportZip([qualified]))
    expect(Object.keys(archive).sort()).toEqual([
      'activities.csv',
      'leads.csv',
      'stage-history.csv',
    ])
    for (const data of Object.values(archive)) {
      expect(Array.from(data.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    }
    expect(leadExportFilename('2026-08-13')).toBe('mypath-leads-export-2026-08-13.zip')
  })
})
