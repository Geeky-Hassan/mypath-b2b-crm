import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const initial = readFileSync(
  new URL('../../supabase/migrations/202608030001_initial_crm.sql', import.meta.url),
  'utf8',
)
const expanded = readFileSync(
  new URL(
    '../../supabase/migrations/202608030002_expand_lead_management.sql',
    import.meta.url,
  ),
  'utf8',
)
const hardening = readFileSync(
  new URL('../../supabase/migrations/202608030004_v1_hardening.sql', import.meta.url),
  'utf8',
)
const boundaries = readFileSync(
  new URL(
    '../../supabase/migrations/202608030005_role_boundaries_and_quality.sql',
    import.meta.url,
  ),
  'utf8',
)
const reconciliation = readFileSync(
  new URL(
    '../../supabase/migrations/202608030006_reconcile_pipeline_stage_values.sql',
    import.meta.url,
  ),
  'utf8',
)
const contextualHistory = readFileSync(
  new URL(
    '../../supabase/migrations/202608030007_stage_context_and_follow_up.sql',
    import.meta.url,
  ),
  'utf8',
)
const teamOperations = readFileSync(
  new URL('../../supabase/migrations/202608030008_team_operations.sql', import.meta.url),
  'utf8',
)
const directLoginAccess = readFileSync(
  new URL(
    '../../supabase/migrations/202608040009_direct_login_account_access.sql',
    import.meta.url,
  ),
  'utf8',
)
const safeRemoval = readFileSync(
  new URL(
    '../../supabase/migrations/202608040010_safe_team_member_removal.sql',
    import.meta.url,
  ),
  'utf8',
)
const taskConsistency = readFileSync(
  new URL(
    '../../supabase/migrations/202608040011_task_assignment_consistency.sql',
    import.meta.url,
  ),
  'utf8',
)
const workflowUpgrade = readFileSync(
  new URL(
    '../../supabase/migrations/202608050012_reliability_and_lead_workflow.sql',
    import.meta.url,
  ),
  'utf8',
)
const preImportReadiness = readFileSync(
  new URL('../../supabase/verification/pre_import_readiness.sql', import.meta.url),
  'utf8',
)
const sampleSeed = readFileSync(
  new URL('../../supabase/seed.sql', import.meta.url),
  'utf8',
)

describe('RLS migration contract', () => {
  it('repairs required enum labels before table defaults use them', () => {
    const addNew = initial.indexOf(
      "alter type public.pipeline_stage add value if not exists 'new';",
    )
    const enumCommit = initial.indexOf('commit;', addNew)
    const pipelineTable = initial.indexOf(
      'create table if not exists public.lead_pipeline',
    )

    expect(addNew).toBeGreaterThan(-1)
    expect(enumCommit).toBeGreaterThan(addNew)
    expect(pipelineTable).toBeGreaterThan(enumCommit)
  })

  it('limits shared lead reads and writes to authenticated sessions', () => {
    expect(initial).toMatch(
      /create policy leads_read_authenticated[\s\S]*for select to authenticated using \(true\)/,
    )
    expect(initial).toMatch(
      /create policy leads_insert_authenticated[\s\S]*created_by = \(select auth\.uid\(\)\)/,
    )
    expect(initial).toMatch(
      /create policy leads_update_authenticated[\s\S]*for update to authenticated/,
    )
  })

  it('requires founder status and archive state for permanent lead deletion', () => {
    expect(expanded).toMatch(
      /create policy leads_delete_founder_archived[\s\S]*private\.is_founder\(\)[\s\S]*lifecycle_status = 'archived'/,
    )
  })

  it('keeps target writes founder-only and target reads owner-scoped', () => {
    expect(expanded).toMatch(
      /create policy targets_read_own_or_founder[\s\S]*user_id = \(select auth\.uid\(\)\)/,
    )
    expect(hardening).toContain(
      'drop policy if exists targets_insert_own_or_founder on public.targets;',
    )
    expect(hardening).toMatch(
      /create policy targets_insert_founder[\s\S]*private\.is_founder\(\)/,
    )
  })

  it('revokes anonymous access and direct stage-history writes', () => {
    expect(hardening).toContain('revoke all on all tables in schema public from anon;')
    expect(hardening).toContain(
      'revoke insert, update, delete on public.stage_history from authenticated;',
    )
  })

  it('enforces lead-generator field and stage boundaries in the database', () => {
    expect(boundaries).toContain(
      'create or replace function public.enforce_lead_role_boundaries()',
    )
    expect(boundaries).toMatch(
      /old\.current_pipeline_stage = 'lead_added'[\s\S]*new\.current_pipeline_stage = 'qualified'/,
    )
    expect(boundaries).toContain(
      'This sales or lifecycle field requires the Founder role',
    )
    expect(boundaries).toContain(
      'revoke all on function public.enforce_lead_role_boundaries()',
    )
  })

  it('hides financial lead columns from lead generators at the query boundary', () => {
    expect(boundaries).toContain('create view public.crm_leads')
    expect(boundaries).toMatch(
      /when \(select private\.is_founder\(\)\) then l\.proposed_value[\s\S]*end as proposed_value/,
    )
    expect(boundaries).toContain('revoke select on public.leads from authenticated;')
  })

  it('prevents obsolete enum labels from being stored after reconciliation', () => {
    expect(reconciliation).toContain('leads_supported_pipeline_stage')
    expect(reconciliation).toContain('stage_history_supported_previous_stage')
    expect(reconciliation).toContain('stage_history_supported_new_stage')
    expect(reconciliation).toContain(
      'A lead uses an obsolete pipeline value; reconcile that lead before continuing',
    )
  })

  it('records contextual stage moves without reopening direct history writes', () => {
    expect(contextualHistory).toContain('add column if not exists description text')
    expect(contextualHistory).toContain('stage_history_follow_up_date_required')
    expect(contextualHistory).toContain('public.move_lead_with_context')
    expect(contextualHistory).toContain('security invoker')
    expect(contextualHistory).toContain(
      'revoke all on function public.record_lead_stage_change() from public, anon, authenticated;',
    )
    expect(contextualHistory).toContain(
      'grant execute on function public.move_lead_with_context',
    )
  })

  it('provides two rerunnable sample leads with complete journey context', () => {
    expect(sampleSeed).toContain('Database schema is not ready for sample data.')
    expect(sampleSeed).toContain('202608030008_team_operations.sql')
    expect(sampleSeed).toContain("where profile.role = 'founder'")
    expect(sampleSeed).toContain("where profile.role = 'lead_generator'")
    expect(sampleSeed).toContain('10000000-0000-4000-8000-000000000001')
    expect(sampleSeed).toContain('10000000-0000-4000-8000-000000000002')
    expect(sampleSeed.match(/on conflict \(id\) do nothing/g)).toHaveLength(3)
    expect(sampleSeed).toContain('description,')
    expect(sampleSeed).toContain('follow_up_required,')
    expect(sampleSeed).toContain('follow_up_date')
    expect(sampleSeed.trim().startsWith('-- Optional MyPath CRM sample data')).toBe(true)
    expect(sampleSeed.trim().endsWith('commit;')).toBe(true)
  })

  it('blocks disabled accounts while allowing Founder-issued direct login', () => {
    expect(teamOperations).toContain('create or replace function private.can_use_crm()')
    expect(directLoginAccess).toContain('update public.profiles')
    expect(directLoginAccess).toContain('set must_change_password = false')
    expect(directLoginAccess).toMatch(/account_status = 'active'/)
    expect(directLoginAccess).not.toMatch(
      /account_status = 'active'[\s\S]*not must_change_password/,
    )
    expect(teamOperations).toContain('drop policy if exists leads_read_authenticated')
    expect(teamOperations).toMatch(
      /create policy leads_read_authenticated[\s\S]*private\.can_use_crm\(\)/,
    )
    expect(teamOperations).toMatch(
      /create policy profiles_read_authenticated[\s\S]*id = \(select auth\.uid\(\)\)[\s\S]*account_status = 'active'/,
    )
  })

  it('enforces task assignment and account-administration boundaries in SQL', () => {
    expect(teamOperations).toContain('create table public.crm_tasks')
    expect(teamOperations).toContain('create table public.task_events')
    expect(teamOperations).toContain('Only the Founder can edit task assignment details')
    expect(teamOperations).toMatch(
      /create policy crm_tasks_insert_founder[\s\S]*private\.is_founder\(\)/,
    )
    expect(teamOperations).toMatch(
      /create policy crm_tasks_delete_founder[\s\S]*private\.is_founder\(\)/,
    )
    expect(teamOperations).toContain(
      'revoke insert, update, delete on public.task_events from authenticated',
    )
  })

  it('adds phone access without exposing financial columns', () => {
    expect(teamOperations).toContain('add column contact_phone text')
    expect(teamOperations).toContain('leads_contact_phone_e164')
    expect(teamOperations).toContain(
      'grant select (contact_phone) on public.leads to authenticated',
    )
    expect(teamOperations).toMatch(
      /when \(select private\.is_founder\(\)\) then l\.proposed_value/,
    )
  })

  it('deletes tasks and task events transactionally for the Founder only', () => {
    expect(safeRemoval).toContain('create or replace function public.delete_crm_task')
    expect(safeRemoval).toContain(
      "message = 'Only the Founder can permanently delete tasks'",
    )
    expect(safeRemoval).toMatch(
      /delete from public\.task_events where task_id = p_task_id;[\s\S]*delete from public\.crm_tasks where id = p_task_id;/,
    )
    expect(safeRemoval).toContain('on delete cascade')
    expect(safeRemoval).toContain(
      'grant execute on function public.delete_crm_task(uuid) to authenticated',
    )
  })

  it('removes linked task assignments when a lead is permanently deleted', () => {
    expect(taskConsistency).toContain('drop constraint if exists crm_tasks_lead_id_fkey')
    expect(taskConsistency).toMatch(
      /foreign key \(lead_id\)[\s\S]*references public\.leads\(id\)[\s\S]*on delete cascade/,
    )
    expect(taskConsistency).not.toMatch(/delete from public\.leads/)
  })

  it('moves qualification scores to 0-11 and adds the new sources transactionally', () => {
    expect(workflowUpgrade).toContain(
      "alter type public.lead_source add value if not exists 'google'",
    )
    expect(workflowUpgrade).toContain(
      "alter type public.lead_source add value if not exists 'ai'",
    )
    expect(workflowUpgrade).toMatch(
      /round\(qualification_score::numeric \* 11 \/ 100\)::integer/,
    )
    expect(workflowUpgrade).toMatch(
      /constraint leads_qualification_score_range[\s\S]*between 0 and 11/,
    )
  })

  it('allows readiness follow-up edits but retains lead-generator sales boundaries', () => {
    expect(workflowUpgrade).not.toMatch(
      /new\.next_action is distinct from old\.next_action/,
    )
    expect(workflowUpgrade).toContain(
      "message = 'This sales or lifecycle field requires the Founder role'",
    )
    expect(workflowUpgrade).toMatch(
      /new\.lifecycle_status = 'archived'[\s\S]*old\.lifecycle_status = 'archived'[\s\S]*new\.lifecycle_status = 'active'/,
    )
  })

  it('requires active access, archive state, and exact name through a deletion RPC', () => {
    expect(workflowUpgrade).toContain('public.delete_archived_lead')
    expect(workflowUpgrade).toContain('private.can_use_crm()')
    expect(workflowUpgrade).toContain("lifecycle_status = 'archived'")
    expect(workflowUpgrade).toContain(
      'p_expected_company_name is distinct from v_company_name',
    )
    expect(workflowUpgrade).toContain('revoke delete on public.leads from authenticated')
    expect(workflowUpgrade).toContain(
      'grant execute on function public.delete_archived_lead(uuid, text)',
    )
  })

  it('removes team workload without deleting or falsifying lead audit history', () => {
    expect(safeRemoval).toContain(
      'create or replace function public.remove_lead_generator_account',
    )
    expect(safeRemoval).toContain(
      'delete from public.crm_tasks where assigned_to = p_user_id',
    )
    expect(safeRemoval).toContain('delete from public.targets where user_id = p_user_id')
    expect(safeRemoval).toMatch(
      /update public\.leads[\s\S]*set owner_id = p_removed_by[\s\S]*where owner_id = p_user_id/,
    )
    expect(safeRemoval).toContain("full_name = 'Former team member'")
    expect(safeRemoval).toContain("account_status = 'removed'")
    expect(safeRemoval).not.toMatch(/delete from public\.leads/)
    expect(safeRemoval).not.toMatch(/delete from public\.lead_activities/)
    expect(safeRemoval).not.toMatch(/delete from public\.stage_history/)
    expect(safeRemoval).toContain('to service_role')
    expect(safeRemoval).toContain('from public, anon, authenticated')
  })

  it('prevents assigning new records to disabled or removed accounts', () => {
    expect(safeRemoval).toContain('public.require_active_lead_owner()')
    expect(safeRemoval).toContain('public.require_active_target_user()')
    expect(safeRemoval).toContain('public.require_active_task_assignee()')
    expect(safeRemoval).toContain("message = 'Lead owner must have active CRM access'")
    expect(safeRemoval).toContain("message = 'Target user must have active CRM access'")
    expect(safeRemoval).toContain("message = 'Task assignee must have active CRM access'")
    expect(
      safeRemoval.match(/from public, anon, authenticated;/g)?.length,
    ).toBeGreaterThanOrEqual(4)
  })

  it('provides read-only pre-import data-integrity and security checks', () => {
    expect(preImportReadiness).toContain("'task_event_cascade'")
    expect(preImportReadiness).toContain("'rls_policy_whitelist'")
    expect(preImportReadiness).toContain("'lead_stage_history_alignment'")
    expect(preImportReadiness).toContain("'duplicate_contact_emails'")
    expect(preImportReadiness).toContain("'duplicate_websites'")
    expect(preImportReadiness).not.toMatch(/\bdelete\s+from\b/i)
    expect(preImportReadiness).not.toMatch(/\bupdate\s+public\./i)
    expect(preImportReadiness).not.toMatch(/\binsert\s+into\b/i)
    expect(preImportReadiness).not.toMatch(/\balter\s+table\b/i)
  })
})
