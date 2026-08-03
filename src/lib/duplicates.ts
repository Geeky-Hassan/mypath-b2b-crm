export interface DuplicateCandidate {
  id?: string
  company_name: string
  website?: string | null
  email?: string | null
}

export interface DuplicateMatch {
  id?: string
  company_name: string
  matchedFields: Array<'website' | 'email'>
}

export function normalizeLeadEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function normalizeLeadWebsite(value: string | null | undefined): string {
  if (!value?.trim()) return ''
  const prepared = /^https?:\/\//i.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`
  try {
    return new URL(prepared).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
  }
}

export function findDuplicateLeads(
  candidate: DuplicateCandidate,
  existing: DuplicateCandidate[],
  excludeId?: string,
): DuplicateMatch[] {
  const email = normalizeLeadEmail(candidate.email)
  const website = normalizeLeadWebsite(candidate.website)
  if (!email && !website) return []

  return existing.flatMap((lead) => {
    if (lead.id && lead.id === excludeId) return []
    const matchedFields: DuplicateMatch['matchedFields'] = []
    if (email && normalizeLeadEmail(lead.email) === email) matchedFields.push('email')
    if (website && normalizeLeadWebsite(lead.website) === website) {
      matchedFields.push('website')
    }
    return matchedFields.length
      ? [{ id: lead.id, company_name: lead.company_name, matchedFields }]
      : []
  })
}
