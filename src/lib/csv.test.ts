import { describe, expect, it } from 'vitest'
import {
  IMPORT_FIELDS,
  autoMapColumns,
  importTemplateCsv,
  importFieldsForRole,
  leadGeneratorTemplateCsv,
  leadsToExportCsv,
  mapCsvRecord,
  parseCsvText,
  resolveOwnerId,
} from './csv'

describe('CSV parsing and mapping', () => {
  it('parses quoted commas and trims values', () => {
    const parsed = parseCsvText(
      'company_name,notes,email\r\n"Northstar, Ltd","Needs one, shared view", alex@example.com ',
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.rows[0]).toEqual({
      company_name: 'Northstar, Ltd',
      notes: 'Needs one, shared view',
      email: 'alex@example.com',
    })
  })

  it('automatically maps canonical headers and common aliases', () => {
    const mapping = autoMapColumns(['Company', 'Contact Email', 'Assigned To', 'Stage'])
    expect(mapping.company_name).toBe('Company')
    expect(mapping.email).toBe('Contact Email')
    expect(mapping.owner_email).toBe('Assigned To')
    expect(mapping.current_pipeline_stage).toBe('Stage')
  })

  it('maps a source record through the selected columns', () => {
    const mapping = autoMapColumns(['Company', 'Contact Email'])
    const mapped = mapCsvRecord(
      { Company: 'Northstar', 'Contact Email': 'alex@example.com' },
      mapping,
    )
    expect(mapped.company_name).toBe('Northstar')
    expect(mapped.email).toBe('alex@example.com')
    expect(mapped.country).toBe('')
  })

  it('generates a parseable template with every supported import column', () => {
    const parsed = parseCsvText(importTemplateCsv())
    expect(parsed.headers).toEqual(IMPORT_FIELDS.map((field) => field.key))
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]?.company_name).toBe('Northstar Learning')
  })

  it('creates an Excel-ready Lead Generator template with phone but no protected columns', () => {
    const parsed = parseCsvText(leadGeneratorTemplateCsv())
    const visibleKeys = importFieldsForRole(false).map((field) => field.key)
    expect(parsed.headers).toEqual(visibleKeys)
    expect(parsed.headers).toContain('contact_phone')
    expect(parsed.headers).not.toContain('proposed_value')
    expect(parsed.headers).not.toContain('current_pipeline_stage')
    expect(parsed.rows).toHaveLength(2)
  })

  it('escapes spreadsheet formulas during export', () => {
    const csv = leadsToExportCsv([
      {
        company_name: '=HYPERLINK("https://evil.example")',
        owner: { email: 'owner@example.com' },
        created_at: '2026-08-03T00:00:00Z',
        updated_at: '2026-08-03T00:00:00Z',
      } as never,
    ])
    expect(csv).toContain("'=HYPERLINK")
  })

  it('does not assign imported leads to a disabled account', () => {
    const profiles = [
      {
        id: 'disabled-user',
        email: 'disabled@example.com',
        account_status: 'disabled',
      },
      {
        id: 'active-user',
        email: 'active@example.com',
        account_status: 'active',
      },
    ] as never

    expect(resolveOwnerId('disabled@example.com', profiles, 'founder')).toBeNull()
    expect(resolveOwnerId('active@example.com', profiles, 'founder')).toBe('active-user')
    expect(resolveOwnerId('', profiles, 'founder')).toBe('founder')
  })
})
