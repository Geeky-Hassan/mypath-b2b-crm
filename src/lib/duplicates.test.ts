import { describe, expect, it } from 'vitest'
import {
  findDuplicateLeads,
  normalizeLeadEmail,
  normalizeLeadWebsite,
} from './duplicates'

const existing = [
  {
    id: 'lead-1',
    company_name: 'Northstar Learning',
    website: 'https://www.northstar.example/path',
    email: 'alex@northstar.example',
  },
]

describe('lead duplicate detection', () => {
  it('normalizes email case and whitespace', () => {
    expect(normalizeLeadEmail('  ALEX@Northstar.Example ')).toBe('alex@northstar.example')
  })

  it('normalizes protocol, www, and website paths to a hostname', () => {
    expect(normalizeLeadWebsite('northstar.example/another-page')).toBe(
      'northstar.example',
    )
  })

  it('reports both matching identifiers', () => {
    const matches = findDuplicateLeads(
      {
        company_name: 'Potential duplicate',
        website: 'http://northstar.example',
        email: 'ALEX@NORTHSTAR.EXAMPLE',
      },
      existing,
    )
    expect(matches).toHaveLength(1)
    expect(matches[0]?.matchedFields).toEqual(['email', 'website'])
  })

  it('excludes the current record while editing', () => {
    expect(findDuplicateLeads(existing[0], existing, 'lead-1')).toEqual([])
  })

  it('does not flag leads without an email or website', () => {
    expect(
      findDuplicateLeads(
        { company_name: 'No identifiers', email: '', website: '' },
        existing,
      ),
    ).toEqual([])
  })
})
