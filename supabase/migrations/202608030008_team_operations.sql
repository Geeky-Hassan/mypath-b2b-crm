-- Team operations, secure account state, tasks, and international lead phones.
-- Apply after 202608030007_stage_context_and_follow_up.sql.

begin;

do $$
begin
  if to_regclass('public.crm_tasks') is not null then
    raise exception using
      errcode = '55000',
      message = 'Team operations are already installed; do not rerun migration 8';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_history'
      and column_name = 'description'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Migration 7 must be applied before migration 8';
  end if;
end
$$;

do $$ begin
  create type public.account_status as enum ('active', 'disabled');
exception when duplicate_object then null;
end $$;

alter type public.account_status add value if not exists 'active';
alter type public.account_status add value if not exists 'disabled';

do $$ begin
  create type public.task_status as enum (
    'todo',
    'in_progress',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

alter type public.task_status add value if not exists 'todo';
alter type public.task_status add value if not exists 'in_progress';
alter type public.task_status add value if not exists 'completed';
alter type public.task_status add value if not exists 'cancelled';

do $$ begin
  create type public.task_type as enum (
    'research',
    'data_enrichment',
    'qualification',
    'outreach_preparation',
    'follow_up',
    'administrative',
    'other'
  );
exception when duplicate_object then null;
end $$;

alter type public.task_type add value if not exists 'research';
alter type public.task_type add value if not exists 'data_enrichment';
alter type public.task_type add value if not exists 'qualification';
alter type public.task_type add value if not exists 'outreach_preparation';
alter type public.task_type add value if not exists 'follow_up';
alter type public.task_type add value if not exists 'administrative';
alter type public.task_type add value if not exists 'other';

commit;

begin;

alter table public.profiles
  add column job_title text,
  add column responsibilities text,
  add column account_status public.account_status not null default 'active',
  add column must_change_password boolean not null default false;

alter table public.leads
  add column contact_phone text;

alter table public.leads
  add constraint leads_contact_phone_e164
  check (
    contact_phone is null
    or contact_phone ~ '^\+[1-9][0-9]{6,14}$'
  ) not valid;

comment on column public.leads.contact_phone is
  'Optional primary-contact phone stored in normalized E.164 format.';

create or replace function private.is_active_crm_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('founder', 'lead_generator')
      and account_status = 'active'
  );
$$;

create or replace function private.can_use_crm()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('founder', 'lead_generator')
      and account_status = 'active'
      and not must_change_password
  );
$$;

create or replace function private.is_founder()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'founder'
      and account_status = 'active'
      and not must_change_password
  );
$$;

create or replace function public.protect_profile_authorization_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and (
    new.id is distinct from old.id
    or new.email is distinct from old.email
    or new.role is distinct from old.role
    or new.account_status is distinct from old.account_status
    or new.must_change_password is distinct from old.must_change_password
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Profile authorization fields can only be changed by the account service';
  end if;
  return new;
end;
$$;

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  task_type public.task_type not null default 'other',
  lead_id uuid references public.leads(id) on delete set null,
  assigned_to uuid not null references public.profiles(id),
  assigned_by uuid not null references public.profiles(id),
  priority public.lead_priority not null default 'medium',
  status public.task_status not null default 'todo',
  due_date date not null,
  completion_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.crm_tasks(id) on delete cascade,
  event_type text not null check (
    event_type in ('created', 'status_changed', 'reassigned')
  ),
  previous_status public.task_status,
  new_status public.task_status,
  previous_assignee uuid references public.profiles(id),
  new_assignee uuid references public.profiles(id),
  note text,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);

create or replace function public.prepare_crm_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.assigned_by = auth.uid();
    end if;
  elsif auth.uid() is not null and not (select private.is_founder()) then
    if old.assigned_to <> auth.uid() then
      raise exception 'Only the assigned user may update this task';
    end if;

    if new.id is distinct from old.id
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.task_type is distinct from old.task_type
      or new.lead_id is distinct from old.lead_id
      or new.assigned_to is distinct from old.assigned_to
      or new.assigned_by is distinct from old.assigned_by
      or new.priority is distinct from old.priority
      or new.due_date is distinct from old.due_date
      or new.created_at is distinct from old.created_at then
      raise exception 'Only the Founder can edit task assignment details';
    end if;

    if new.status = 'cancelled' and old.status <> 'cancelled' then
      raise exception 'Only the Founder can cancel a task';
    end if;
  end if;

  if new.status = 'completed' then
    if tg_op = 'INSERT' then
      new.completed_at = coalesce(new.completed_at, now());
    else
      new.completed_at = coalesce(old.completed_at, now());
    end if;
  else
    new.completed_at = null;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.record_crm_task_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.assigned_by);
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (
      task_id,
      event_type,
      new_status,
      new_assignee,
      note,
      changed_by,
      changed_at
    ) values (
      new.id,
      'created',
      new.status,
      new.assigned_to,
      nullif(trim(new.description), ''),
      v_actor,
      new.created_at
    );
    return new;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.task_events (
      task_id,
      event_type,
      previous_assignee,
      new_assignee,
      note,
      changed_by
    ) values (
      new.id,
      'reassigned',
      old.assigned_to,
      new.assigned_to,
      null,
      v_actor
    );
  end if;

  if new.status is distinct from old.status then
    insert into public.task_events (
      task_id,
      event_type,
      previous_status,
      new_status,
      new_assignee,
      note,
      changed_by
    ) values (
      new.id,
      'status_changed',
      old.status,
      new.status,
      new.assigned_to,
      case when new.status = 'completed'
        then nullif(trim(new.completion_note), '')
        else null
      end,
      v_actor
    );
  end if;

  return new;
end;
$$;

create trigger prepare_crm_task
before insert or update on public.crm_tasks
for each row execute function public.prepare_crm_task();

create trigger record_crm_task_event
after insert or update on public.crm_tasks
for each row execute function public.record_crm_task_event();

create index crm_tasks_assignee_status_due_idx
on public.crm_tasks(assigned_to, status, due_date);
create index crm_tasks_lead_idx on public.crm_tasks(lead_id)
where lead_id is not null;
create index crm_tasks_completed_idx on public.crm_tasks(completed_at desc)
where completed_at is not null;
create index task_events_task_date_idx
on public.task_events(task_id, changed_at desc);

alter table public.crm_tasks enable row level security;
alter table public.task_events enable row level security;

-- Rebuild every active V1 policy around account state. A disabled user with an
-- otherwise-valid JWT receives no CRM data. A temporary-password user may read
-- only their own profile so the application can route them to password change.
drop policy if exists profiles_read_authenticated on public.profiles;
create policy profiles_read_authenticated on public.profiles
for select to authenticated
using (
  (select private.can_use_crm())
  or (
    id = (select auth.uid())
    and account_status = 'active'
  )
);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own_or_founder on public.profiles
for update to authenticated
using (
  (select private.can_use_crm())
  and (
    id = (select auth.uid())
    or (select private.is_founder())
  )
)
with check (
  (select private.can_use_crm())
  and (
    id = (select auth.uid())
    or (select private.is_founder())
  )
);

drop policy if exists leads_read_authenticated on public.leads;
create policy leads_read_authenticated on public.leads
for select to authenticated using ((select private.can_use_crm()));
drop policy if exists leads_insert_authenticated on public.leads;
create policy leads_insert_authenticated on public.leads
for insert to authenticated
with check (
  (select private.can_use_crm())
  and created_by = (select auth.uid())
);
drop policy if exists leads_update_authenticated on public.leads;
create policy leads_update_authenticated on public.leads
for update to authenticated
using ((select private.can_use_crm()))
with check ((select private.can_use_crm()));
drop policy if exists leads_delete_founder_archived on public.leads;
create policy leads_delete_founder_archived on public.leads
for delete to authenticated
using (
  (select private.is_founder())
  and lifecycle_status = 'archived'
);

drop policy if exists lead_activities_read_authenticated on public.lead_activities;
create policy lead_activities_read_authenticated on public.lead_activities
for select to authenticated using ((select private.can_use_crm()));
drop policy if exists lead_activities_insert_authenticated on public.lead_activities;
create policy lead_activities_insert_authenticated on public.lead_activities
for insert to authenticated
with check (
  (select private.can_use_crm())
  and created_by = (select auth.uid())
);
drop policy if exists lead_activities_update_own_or_founder on public.lead_activities;
create policy lead_activities_update_own_or_founder on public.lead_activities
for update to authenticated
using (
  (select private.can_use_crm())
  and (
    created_by = (select auth.uid())
    or (select private.is_founder())
  )
)
with check (
  (select private.can_use_crm())
  and (
    created_by = (select auth.uid())
    or (select private.is_founder())
  )
);
drop policy if exists lead_activities_delete_own_or_founder on public.lead_activities;
create policy lead_activities_delete_own_or_founder on public.lead_activities
for delete to authenticated
using (
  (select private.can_use_crm())
  and (
    created_by = (select auth.uid())
    or (select private.is_founder())
  )
);

drop policy if exists stage_history_read_authenticated on public.stage_history;
create policy stage_history_read_authenticated on public.stage_history
for select to authenticated using ((select private.can_use_crm()));

drop policy if exists targets_read_own_or_founder on public.targets;
create policy targets_read_own_or_founder on public.targets
for select to authenticated
using (
  (select private.can_use_crm())
  and (
    user_id = (select auth.uid())
    or (select private.is_founder())
  )
);
drop policy if exists targets_insert_founder on public.targets;
create policy targets_insert_founder on public.targets
for insert to authenticated
with check ((select private.is_founder()));
drop policy if exists targets_update_founder on public.targets;
create policy targets_update_founder on public.targets
for update to authenticated
using ((select private.is_founder()))
with check ((select private.is_founder()));
drop policy if exists targets_delete_founder on public.targets;
create policy targets_delete_founder on public.targets
for delete to authenticated using ((select private.is_founder()));

drop policy if exists settings_read_authenticated on public.crm_settings;
create policy settings_read_authenticated on public.crm_settings
for select to authenticated using ((select private.can_use_crm()));
drop policy if exists settings_update_founder on public.crm_settings;
create policy settings_update_founder on public.crm_settings
for update to authenticated
using ((select private.is_founder()))
with check ((select private.is_founder()));

drop policy if exists sales_costs_founder_all on public.sales_costs;
create policy sales_costs_founder_all on public.sales_costs
for all to authenticated
using ((select private.is_founder()))
with check (
  (select private.is_founder())
  and created_by = (select auth.uid())
);

create policy crm_tasks_read_assignee_or_founder on public.crm_tasks
for select to authenticated
using (
  (select private.can_use_crm())
  and (
    assigned_to = (select auth.uid())
    or (select private.is_founder())
  )
);
create policy crm_tasks_insert_founder on public.crm_tasks
for insert to authenticated
with check (
  (select private.is_founder())
  and assigned_by = (select auth.uid())
);
create policy crm_tasks_update_assignee_or_founder on public.crm_tasks
for update to authenticated
using (
  (select private.can_use_crm())
  and (
    assigned_to = (select auth.uid())
    or (select private.is_founder())
  )
)
with check (
  (select private.can_use_crm())
  and (
    assigned_to = (select auth.uid())
    or (select private.is_founder())
  )
);
create policy crm_tasks_delete_founder on public.crm_tasks
for delete to authenticated using ((select private.is_founder()));

create policy task_events_read_assignee_or_founder on public.task_events
for select to authenticated
using (
  (select private.can_use_crm())
  and exists (
    select 1
    from public.crm_tasks task
    where task.id = task_events.task_id
      and (
        task.assigned_to = (select auth.uid())
        or (select private.is_founder())
      )
  )
);

-- Keep the role-aware lead graph aligned with the new contact field and account
-- state. Financial fields remain Founder-only.
drop view if exists public.crm_leads;

create view public.crm_leads
with (security_barrier = true)
as
select
  l.id,
  l.company_name,
  l.website,
  l.country,
  l.region,
  l.customer_segment,
  l.company_size,
  l.education_offering,
  l.current_lms_or_tools,
  l.contact_name,
  l.job_title,
  l.email,
  l.contact_phone,
  l.linkedin_url,
  l.decision_maker_status,
  l.main_pain_point,
  l.reason_mypath_is_relevant,
  l.current_alternative,
  l.budget_indicator,
  l.qualification_score,
  l.priority,
  l.source,
  l.owner_id,
  l.created_by,
  l.current_pipeline_stage,
  l.lifecycle_status,
  l.date_added,
  l.first_contacted_at,
  l.last_contacted_at,
  l.next_action,
  l.next_action_date,
  l.demo_date,
  case
    when (select private.is_founder()) then l.proposed_value
    else null::numeric
  end as proposed_value,
  case
    when (select private.is_founder()) then l.expected_close_date
    else null::date
  end as expected_close_date,
  l.lost_reason,
  l.notes,
  l.created_at,
  l.updated_at,
  jsonb_build_object(
    'id', owner_profile.id,
    'full_name', owner_profile.full_name,
    'email', owner_profile.email,
    'role', owner_profile.role
  ) as owner,
  jsonb_build_object(
    'id', creator_profile.id,
    'full_name', creator_profile.full_name,
    'email', creator_profile.email,
    'role', creator_profile.role
  ) as creator,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', activity.id,
          'lead_id', activity.lead_id,
          'activity_type', activity.activity_type,
          'activity_date', activity.activity_date,
          'summary', activity.summary,
          'notes', activity.notes,
          'created_by', activity.created_by,
          'created_at', activity.created_at,
          'creator', jsonb_build_object(
            'id', activity_creator.id,
            'full_name', activity_creator.full_name,
            'email', activity_creator.email,
            'role', activity_creator.role
          )
        ) order by activity.activity_date desc
      )
      from public.lead_activities activity
      join public.profiles activity_creator on activity_creator.id = activity.created_by
      where activity.lead_id = l.id
    ),
    '[]'::jsonb
  ) as activities,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', history.id,
          'lead_id', history.lead_id,
          'previous_stage', history.previous_stage,
          'new_stage', history.new_stage,
          'changed_by', history.changed_by,
          'changed_at', history.changed_at,
          'description', history.description,
          'follow_up_required', history.follow_up_required,
          'follow_up_date', history.follow_up_date,
          'actor', jsonb_build_object(
            'id', history_actor.id,
            'full_name', history_actor.full_name,
            'email', history_actor.email,
            'role', history_actor.role
          )
        ) order by history.changed_at desc
      )
      from public.stage_history history
      join public.profiles history_actor on history_actor.id = history.changed_by
      where history.lead_id = l.id
    ),
    '[]'::jsonb
  ) as stage_history
from public.leads l
join public.profiles owner_profile on owner_profile.id = l.owner_id
join public.profiles creator_profile on creator_profile.id = l.created_by
where (select private.can_use_crm());

revoke all on public.crm_tasks, public.task_events from public, anon;
grant select, insert, update, delete on public.crm_tasks to authenticated;
grant select on public.task_events to authenticated;
revoke insert, update, delete on public.task_events from authenticated;

revoke all on public.crm_leads from public, anon;
grant select on public.crm_leads to authenticated;

grant select (contact_phone) on public.leads to authenticated;

revoke all on function private.is_active_crm_user() from public, anon;
revoke all on function private.can_use_crm() from public, anon;
grant execute on function private.is_active_crm_user() to authenticated;
grant execute on function private.can_use_crm() to authenticated;

revoke all on function public.prepare_crm_task() from public, anon, authenticated;
revoke all on function public.record_crm_task_event() from public, anon, authenticated;

commit;
