-- Expand the original MyPath CRM foundation into the V1 lead-management model.
-- This is a forward migration: apply 202608030001 first, then this file.

begin;

do $$
begin
  if to_regclass('public.lead_activities') is not null
    or exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'full_name'
    ) then
    raise exception using
      errcode = '55000',
      message = 'The expanded MyPath schema already exists; do not rerun migration 2';
  end if;
end
$$;

do $$ begin
  create type public.lead_priority as enum ('low', 'medium', 'high');
exception when duplicate_object then null;
end $$;

alter type public.lead_priority add value if not exists 'low';
alter type public.lead_priority add value if not exists 'medium';
alter type public.lead_priority add value if not exists 'high';

do $$ begin
  create type public.lead_source as enum ('email', 'linkedin', 'referral', 'event', 'other');
exception when duplicate_object then null;
end $$;

alter type public.lead_source add value if not exists 'email';
alter type public.lead_source add value if not exists 'linkedin';
alter type public.lead_source add value if not exists 'referral';
alter type public.lead_source add value if not exists 'event';
alter type public.lead_source add value if not exists 'other';

do $$ begin
  create type public.lead_lifecycle_status as enum ('active', 'nurture', 'won', 'lost', 'archived');
exception when duplicate_object then null;
end $$;

alter type public.lead_lifecycle_status add value if not exists 'active';
alter type public.lead_lifecycle_status add value if not exists 'nurture';
alter type public.lead_lifecycle_status add value if not exists 'won';
alter type public.lead_lifecycle_status add value if not exists 'lost';
alter type public.lead_lifecycle_status add value if not exists 'archived';

do $$ begin
  create type public.target_period_type as enum ('weekly', 'monthly');
exception when duplicate_object then null;
end $$;

alter type public.target_period_type add value if not exists 'weekly';
alter type public.target_period_type add value if not exists 'monthly';

-- Commit any labels added to pre-existing enums before using them in defaults.
commit;

begin;

-- Profiles now expose the authenticated user's name and email directly.
alter table public.profiles rename column display_name to full_name;
alter table public.profiles add column email text;

update public.profiles p
set email = coalesce(
  (select u.email from auth.users u where u.id = p.id),
  p.id::text || '@invalid.local'
);

alter table public.profiles alter column email set not null;
create unique index if not exists profiles_email_lower_uq on public.profiles(lower(email));

-- Add the V1 lead fields while the original companion tables are still available for backfill.
alter table public.leads
  rename column contact_title to job_title;
alter table public.leads
  rename column contact_email to email;

alter table public.leads
  add column country text,
  add column region text,
  add column customer_segment text,
  add column education_offering text,
  add column current_lms_or_tools text,
  add column decision_maker_status text,
  add column main_pain_point text,
  add column reason_mypath_is_relevant text,
  add column current_alternative text,
  add column budget_indicator text,
  add column qualification_score integer check (qualification_score between 0 and 100),
  add column priority public.lead_priority not null default 'medium',
  add column source_v2 public.lead_source not null default 'other',
  add column owner_id uuid references public.profiles(id),
  add column current_pipeline_stage public.pipeline_stage not null default 'new',
  add column lifecycle_status public.lead_lifecycle_status not null default 'active',
  add column date_added date not null default current_date,
  add column first_contacted_at timestamptz,
  add column last_contacted_at timestamptz,
  add column next_action text,
  add column next_action_date date,
  add column demo_date timestamptz,
  add column proposed_value numeric(14, 2) check (proposed_value >= 0),
  add column expected_close_date date,
  add column lost_reason text,
  add column notes text;

update public.leads l
set country = l.location,
    customer_segment = l.industry,
    decision_maker_status = l.authority_status::text,
    main_pain_point = l.need_summary,
    reason_mypath_is_relevant = l.qualification_summary,
    budget_indicator = l.budget_band,
    qualification_score = l.fit_score,
    date_added = l.created_at::date,
    notes = l.qualification_summary,
    source_v2 = case lower(trim(coalesce(l.source, '')))
      when 'email' then 'email'::public.lead_source
      when 'linkedin' then 'linkedin'::public.lead_source
      when 'referral' then 'referral'::public.lead_source
      when 'event' then 'event'::public.lead_source
      else 'other'::public.lead_source
    end;

update public.leads l
set owner_id = p.owner_id,
    current_pipeline_stage = p.stage,
    lifecycle_status = case
      when p.archived_at is not null then 'archived'::public.lead_lifecycle_status
      when p.stage = 'won' then 'won'::public.lead_lifecycle_status
      when p.stage = 'lost' then 'lost'::public.lead_lifecycle_status
      else 'active'::public.lead_lifecycle_status
    end
from public.lead_pipeline p
where p.lead_id = l.id;

update public.leads l
set proposed_value = f.estimated_value,
    expected_close_date = f.expected_close_date
from public.lead_financials f
where f.lead_id = l.id;

update public.leads set owner_id = created_by where owner_id is null;
alter table public.leads alter column owner_id set not null;

alter table public.leads drop column source;
alter table public.leads rename column source_v2 to source;

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  activity_type text not null check (
    activity_type in ('note', 'email', 'linkedin', 'call', 'meeting', 'demo', 'other')
  ),
  activity_date timestamptz not null default now(),
  summary text not null check (length(trim(summary)) > 0),
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.stage_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  previous_stage public.pipeline_stage,
  new_stage public.pipeline_stage not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_type public.target_period_type not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  target_type text not null check (length(trim(target_type)) > 0),
  target_value numeric(14, 2) not null check (target_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_type, start_date, target_type)
);

-- Preserve notes and the last known stage as timeline records.
insert into public.lead_activities (
  id, lead_id, activity_type, activity_date, summary, notes, created_by, created_at
)
select
  n.id,
  n.lead_id,
  'note',
  n.created_at,
  left(n.body, 120),
  n.body,
  n.created_by,
  n.created_at
from public.lead_notes n
on conflict (id) do nothing;

insert into public.stage_history (
  lead_id, previous_stage, new_stage, changed_by, changed_at
)
select p.lead_id, null, p.stage, p.stage_updated_by, p.stage_updated_at
from public.lead_pipeline p;

-- Convert each populated wide monthly goal into a generic target row.
insert into public.targets (
  user_id, period_type, start_date, end_date, target_type, target_value, created_at, updated_at
)
select profile_id, 'monthly', period_start,
       (period_start + interval '1 month - 1 day')::date,
       'leads_created', leads_created_goal, created_at, updated_at
from public.monthly_targets where leads_created_goal is not null
union all
select profile_id, 'monthly', period_start,
       (period_start + interval '1 month - 1 day')::date,
       'qualified_leads', qualified_leads_goal, created_at, updated_at
from public.monthly_targets where qualified_leads_goal is not null
union all
select profile_id, 'monthly', period_start,
       (period_start + interval '1 month - 1 day')::date,
       'won_deals', won_deals_goal, created_at, updated_at
from public.monthly_targets where won_deals_goal is not null
union all
select profile_id, 'monthly', period_start,
       (period_start + interval '1 month - 1 day')::date,
       'won_value', won_value_goal, created_at, updated_at
from public.monthly_targets where won_value_goal is not null;

-- The lead row is now the source of truth. Remove obsolete triggers, policies, and tables.
drop policy if exists leads_delete_founder_archived on public.leads;
drop trigger if exists on_lead_created on public.leads;
drop trigger if exists track_pipeline_change on public.lead_pipeline;
drop function if exists public.advance_lead_to_qualified(uuid);
drop function if exists public.handle_new_lead();
drop function if exists public.track_pipeline_change();
drop table public.lead_notes;
drop table public.lead_financials;
drop table public.lead_pipeline;
drop table public.monthly_targets;

alter table public.leads
  drop column industry,
  drop column location,
  drop column contact_phone,
  drop column qualification_status,
  drop column fit_score,
  drop column budget_band,
  drop column authority_status,
  drop column need_summary,
  drop column purchase_timeline,
  drop column qualification_summary;

drop index if exists public.leads_contact_email_lower_idx;
create index if not exists leads_email_lower_idx on public.leads(lower(trim(email)))
where email is not null and trim(email) <> '';
create index if not exists leads_website_lower_idx on public.leads(lower(trim(website)))
where website is not null and trim(website) <> '';
create index if not exists leads_stage_idx on public.leads(current_pipeline_stage);
create index if not exists leads_lifecycle_idx on public.leads(lifecycle_status);
create index if not exists leads_owner_idx on public.leads(owner_id);
create index if not exists leads_country_idx on public.leads(country);
create index if not exists leads_segment_idx on public.leads(customer_segment);
create index if not exists leads_priority_idx on public.leads(priority);
create index if not exists lead_activities_lead_date_idx
  on public.lead_activities(lead_id, activity_date desc);
create index if not exists stage_history_lead_date_idx
  on public.stage_history(lead_id, changed_at desc);
create index if not exists targets_user_period_idx
  on public.targets(user_id, start_date, end_date);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(coalesce(new.email, 'CRM user'), '@', 1)
    ),
    coalesce(new.email, new.id::text || '@invalid.local'),
    'lead_generator'
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      updated_at = now();
  return new;
end;
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
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Profile authorization fields can only be changed by an administrator';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_authorization_fields on public.profiles;
create trigger protect_profile_authorization_fields
  before update on public.profiles
  for each row execute function public.protect_profile_authorization_fields();

create or replace function public.protect_lead_system_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Lead provenance fields cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.sync_lead_lifecycle_from_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.current_pipeline_stage is distinct from old.current_pipeline_stage then
    if new.current_pipeline_stage = 'won' then
      new.lifecycle_status = 'won';
    elsif new.current_pipeline_stage = 'lost' then
      new.lifecycle_status = 'lost';
    elsif old.lifecycle_status in ('won', 'lost') then
      new.lifecycle_status = 'active';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.record_lead_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_pipeline_stage is distinct from old.current_pipeline_stage then
    insert into public.stage_history (
      lead_id, previous_stage, new_stage, changed_by, changed_at
    ) values (
      new.id,
      old.current_pipeline_stage,
      new.current_pipeline_stage,
      coalesce(auth.uid(), new.created_by),
      now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists sync_lead_lifecycle_from_stage on public.leads;
create trigger sync_lead_lifecycle_from_stage
  before update of current_pipeline_stage on public.leads
  for each row execute function public.sync_lead_lifecycle_from_stage();

drop trigger if exists record_lead_stage_change on public.leads;
create trigger record_lead_stage_change
after update of current_pipeline_stage on public.leads
for each row execute function public.record_lead_stage_change();

create or replace function public.record_initial_lead_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stage_history (
    lead_id,
    previous_stage,
    new_stage,
    changed_by,
    changed_at
  ) values (
    new.id,
    null,
    new.current_pipeline_stage,
    coalesce(auth.uid(), new.created_by),
    new.created_at
  );
  return new;
end;
$$;

create trigger record_initial_lead_stage
after insert on public.leads
for each row execute function public.record_initial_lead_stage();

create trigger targets_updated_at before update on public.targets
for each row execute function public.set_updated_at();

alter table public.lead_activities enable row level security;
alter table public.stage_history enable row level security;
alter table public.targets enable row level security;

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists leads_delete_founder_archived on public.leads;
create policy leads_delete_founder_archived on public.leads
for delete to authenticated
using (
  (select private.is_founder())
  and lifecycle_status = 'archived'
);

create policy lead_activities_read_authenticated on public.lead_activities
for select to authenticated using (true);
create policy lead_activities_insert_authenticated on public.lead_activities
for insert to authenticated with check (created_by = (select auth.uid()));
create policy lead_activities_update_own_or_founder on public.lead_activities
for update to authenticated
using (created_by = (select auth.uid()) or (select private.is_founder()))
with check (created_by = (select auth.uid()) or (select private.is_founder()));
create policy lead_activities_delete_own_or_founder on public.lead_activities
for delete to authenticated
using (created_by = (select auth.uid()) or (select private.is_founder()));

create policy stage_history_read_authenticated on public.stage_history
for select to authenticated using (true);

create policy targets_read_own_or_founder on public.targets
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_founder()));
create policy targets_insert_own_or_founder on public.targets
for insert to authenticated
with check (user_id = (select auth.uid()) or (select private.is_founder()));
create policy targets_update_own_or_founder on public.targets
for update to authenticated
using (user_id = (select auth.uid()) or (select private.is_founder()))
with check (user_id = (select auth.uid()) or (select private.is_founder()));
create policy targets_delete_own_or_founder on public.targets
for delete to authenticated
using (user_id = (select auth.uid()) or (select private.is_founder()));

revoke all on public.profiles, public.leads, public.lead_activities,
  public.stage_history, public.targets from anon;
grant select on public.profiles, public.leads, public.lead_activities,
  public.stage_history, public.targets to authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on public.leads, public.lead_activities,
  public.targets to authenticated;

-- Stage history is trigger-owned. Authenticated clients receive no direct write grant.
revoke insert, update, delete on public.stage_history from authenticated;

commit;
