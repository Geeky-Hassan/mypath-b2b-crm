-- Atomic task cleanup and audit-safe Lead Generator removal.
-- Apply after 202608040009_direct_login_account_access.sql.

begin;

do $$
begin
  if to_regclass('public.crm_tasks') is null
    or to_regclass('public.task_events') is null then
    raise exception using
      errcode = '55000',
      message = 'Migration 8 must be applied before migration 10';
  end if;
end
$$;

-- Enum labels added to an existing enum must be committed before they can be
-- used by later statements in the migration.
alter type public.account_status add value if not exists 'removed';

commit;

begin;

alter table public.profiles
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references public.profiles(id);

-- Repair databases where migration 8 was partially applied or the task-event
-- foreign key was created without cascading cleanup.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.contype = 'f'
      and constraint_row.conrelid = 'public.task_events'::regclass
      and constraint_row.confrelid = 'public.crm_tasks'::regclass
  loop
    execute format(
      'alter table public.task_events drop constraint %I',
      v_constraint.conname
    );
  end loop;
end
$$;

alter table public.task_events
  add constraint task_events_task_id_fkey
  foreign key (task_id)
  references public.crm_tasks(id)
  on delete cascade;

-- Disabled or removed accounts may retain historical ownership, but they must
-- not receive new leads, targets, or tasks through a direct API request.
create or replace function public.require_active_lead_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
    and not exists (
      select 1 from public.profiles
      where id = new.owner_id and account_status = 'active'
    ) then
    raise exception using
      errcode = '23514',
      message = 'Lead owner must have active CRM access';
  end if;
  return new;
end;
$$;

create or replace function public.require_active_target_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.user_id is distinct from old.user_id)
    and not exists (
      select 1 from public.profiles
      where id = new.user_id and account_status = 'active'
    ) then
    raise exception using
      errcode = '23514',
      message = 'Target user must have active CRM access';
  end if;
  return new;
end;
$$;

create or replace function public.require_active_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
    and not exists (
      select 1 from public.profiles
      where id = new.assigned_to and account_status = 'active'
    ) then
    raise exception using
      errcode = '23514',
      message = 'Task assignee must have active CRM access';
  end if;
  return new;
end;
$$;

drop trigger if exists require_active_lead_owner on public.leads;
create trigger require_active_lead_owner
before insert or update of owner_id on public.leads
for each row execute function public.require_active_lead_owner();

drop trigger if exists require_active_target_user on public.targets;
create trigger require_active_target_user
before insert or update of user_id on public.targets
for each row execute function public.require_active_target_user();

drop trigger if exists require_active_task_assignee on public.crm_tasks;
create trigger require_active_task_assignee
before insert or update of assigned_to on public.crm_tasks
for each row execute function public.require_active_task_assignee();

-- Delete a task and its event history in one transaction. The explicit event
-- delete is intentional: it repairs the user-visible behavior even on a live
-- database whose old foreign key was not cascading before this migration.
create or replace function public.delete_crm_task(p_task_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  if not (select private.is_founder()) then
    raise exception using
      errcode = '42501',
      message = 'Only the Founder can permanently delete tasks';
  end if;

  perform 1
  from public.crm_tasks
  where id = p_task_id
  for update;

  if not found then
    return 0;
  end if;

  delete from public.task_events where task_id = p_task_id;
  delete from public.crm_tasks where id = p_task_id;
  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$$;

-- Service-role-only account cleanup. The Edge Function verifies the caller's
-- JWT and Founder role, then invokes this function with the validated Founder
-- ID. Historical lead/activity/stage authorship stays attached to an anonymized
-- profile so audit records are never silently deleted or reassigned.
create or replace function public.remove_lead_generator_account(
  p_user_id uuid,
  p_removed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_status public.account_status;
  v_tasks_deleted integer := 0;
  v_targets_deleted integer := 0;
  v_leads_reassigned integer := 0;
begin
  if p_user_id is null or p_removed_by is null or p_user_id = p_removed_by then
    raise exception using
      errcode = '22023',
      message = 'Choose a different Lead Generator account';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_removed_by
      and role = 'founder'
      and account_status = 'active'
      and not must_change_password
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active Founder account is required';
  end if;

  select role, account_status
  into v_role, v_status
  from public.profiles
  where id = p_user_id
  for update;

  if not found or v_role <> 'lead_generator' or v_status = 'removed' then
    raise exception using
      errcode = 'P0002',
      message = 'Lead Generator account not found';
  end if;

  delete from public.crm_tasks where assigned_to = p_user_id;
  get diagnostics v_tasks_deleted = row_count;

  delete from public.targets where user_id = p_user_id;
  get diagnostics v_targets_deleted = row_count;

  update public.leads
  set owner_id = p_removed_by,
      updated_at = now()
  where owner_id = p_user_id;
  get diagnostics v_leads_reassigned = row_count;

  update public.profiles
  set full_name = 'Former team member',
      email = 'removed-' || p_user_id::text || '@removed.invalid',
      job_title = null,
      responsibilities = null,
      account_status = 'removed',
      must_change_password = false,
      removed_at = now(),
      removed_by = p_removed_by,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'tasks_deleted', v_tasks_deleted,
    'targets_deleted', v_targets_deleted,
    'leads_reassigned', v_leads_reassigned
  );
end;
$$;

revoke all on function public.delete_crm_task(uuid) from public, anon;
grant execute on function public.delete_crm_task(uuid) to authenticated;

revoke all on function public.remove_lead_generator_account(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.remove_lead_generator_account(uuid, uuid)
  to service_role;

revoke all on function public.require_active_lead_owner()
  from public, anon, authenticated;
revoke all on function public.require_active_target_user()
  from public, anon, authenticated;
revoke all on function public.require_active_task_assignee()
  from public, anon, authenticated;

comment on function public.remove_lead_generator_account(uuid, uuid) is
  'Removes Lead Generator access/workload while preserving anonymized audit provenance.';

commit;
