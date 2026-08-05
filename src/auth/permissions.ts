import type { PipelineStage, UserRole } from '../types/domain'

export function isFounder(role: UserRole | null | undefined): boolean {
  return role === 'founder'
}

export function canPermanentlyDelete(role: UserRole | null | undefined): boolean {
  return role === 'founder' || role === 'lead_generator'
}

export function canManageTargets(role: UserRole | null | undefined): boolean {
  return isFounder(role)
}

export function canArchiveLead(role: UserRole | null | undefined): boolean {
  return isFounder(role)
}

export function canManageDealFields(role: UserRole | null | undefined): boolean {
  return isFounder(role)
}

export function canMoveLead(
  role: UserRole | null | undefined,
  previousStage: PipelineStage,
  newStage: PipelineStage,
): boolean {
  return (
    isFounder(role) ||
    (role === 'lead_generator' &&
      previousStage === 'lead_added' &&
      newStage === 'qualified')
  )
}
