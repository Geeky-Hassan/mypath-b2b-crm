import { missingLeadInformation } from '../lib/leadReadiness'
import type { LeadRecord } from '../types/domain'
import { Badge } from './ui'

export function LeadReadinessBadge({ lead }: { lead: LeadRecord }) {
  const missing = missingLeadInformation(lead)
  if (!missing.length) return <Badge tone="green">Ready for Founder</Badge>

  const detail = `Missing: ${missing.join(', ')}`
  return (
    <span title={detail} aria-label={detail} tabIndex={0}>
      <Badge tone="amber">{missing.length} missing</Badge>
    </span>
  )
}
