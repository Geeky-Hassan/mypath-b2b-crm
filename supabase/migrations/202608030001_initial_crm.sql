-- MyPath CRM initial schema
-- Paste this entire file into a new Supabase SQL Editor query and run it once.
-- Do not paste the filename or append diagnostic snippets to this migration.

begin;

do $$
begin
  if to_regclass('public.crm_leads') is not null
    or exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'full_name'
    ) then
    raise exception using
      errcode = '55000',
      message = 'The expanded MyPath schema already exists; do not rerun migration 1';
  end if;
end
$$;

create extension if not exists pgcrypto;
create schema if not exists private;

do $$ begin
  create type public.user_role as enum ('founder', 'lead_generator');
exception when duplicate_object then null;
end $$;

alter type public.user_role add value if not exists 'founder';
alter type public.user_role add value if not exists 'lead_generator';

do $$ begin
  create type public.pipeline_stage as enum (
    'new', 'qualified', 'discovery', 'proposal', 'negotiation', 'won', 'lost'
  );
exception when duplicate_object then null;
end $$;

-- A previous or partially applied schema may already have this enum with a
-- different label set. Ensure every label used by this migration exists.
alter type public.pipeline_stage add value if not exists 'new';
alter type public.pipeline_stage add value if not exists 'qualified';
alter type public.pipeline_stage add value if not exists 'discovery';
alter type public.pipeline_stage add value if not exists 'proposal';
alter type public.pipeline_stage add value if not exists 'negotiation';
alter type public.pipeline_stage add value if not exists 'won';
alter type public.pipeline_stage add value if not exists 'lost';

do $$ begin
  create type public.qualification_status as enum (
    'unqualified', 'researching', 'qualified', 'disqualified'
  );
exception when duplicate_object then null;
end $$;

alter type public.qualification_status add value if not exists 'unqualified';
alter type public.qualification_status add value if not exists 'researching';
alter type public.qualification_status add value if not exists 'qualified';
alter type public.qualification_status add value if not exists 'disqualified';

do $$ begin
  create type public.authority_status as enum ('unknown', 'yes', 'no');
exception when duplicate_object then null;
end $$;

alter type public.authority_status add value if not exists 'unknown';
alter type public.authority_status add value if not exists 'yes';
alter type public.authority_status add value if not exists 'no';

-- PostgreSQL requires values added to an existing enum to be committed before
-- those values are used in a table default in a later transaction.
commit;

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.user_role not null default 'lead_generator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (length(trim(company_name)) > 0),
  website text,
  industry text,
  company_size text,
  location text,
  source text,
  contact_name text,
  contact_title text,
  contact_email text,
  contact_phone text,
  linkedin_url text,
  qualification_status public.qualification_status not null default 'unqualified',
  fit_score integer check (fit_score between 0 and 100),
  budget_band text,
  authority_status public.authority_status not null default 'unknown',
  need_summary text,
  purchase_timeline text,
  qualification_summary text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_pipeline (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  stage public.pipeline_stage not null default 'new',
  stage_updated_by uuid not null references public.profiles(id),
  stage_updated_at timestamptz not null default now(),
  qualified_by uuid references public.profiles(id),
  qualified_at timestamptz,
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  archived_by uuid references public.profiles(id),
  archived_at timestamptz
);

create table if not exists public.lead_financials (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  estimated_value numeric(14, 2) check (estimated_value >= 0),
  probability integer check (probability between 0 and 100),
  expected_close_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_targets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null check (period_start = date_trunc('month', period_start)::date),
  leads_created_goal integer check (leads_created_goal >= 0),
  qualified_leads_goal integer check (qualified_leads_goal >= 0),
  won_deals_goal integer check (won_deals_goal >= 0),
  won_value_goal numeric(14, 2) check (won_value_goal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, period_start)
);

create table if not exists public.crm_settings (
  id boolean primary key default true check (id),
  organization_name text not null default 'MyPath',
  default_currency text not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.crm_settings (id, organization_name, default_currency)
values (true, 'MyPath', 'USD')
on conflict (id) do nothing;

create index if not exists leads_created_by_idx on public.leads(created_by);
create index if not exists leads_created_at_idx on public.leads(created_at desc);
create index if not exists leads_contact_email_lower_idx on public.leads(lower(contact_email));
create index if not exists lead_pipeline_stage_idx on public.lead_pipeline(stage);
create index if not exists lead_pipeline_owner_idx on public.lead_pipeline(owner_id);
create index if not exists lead_pipeline_qualified_at_idx on public.lead_pipeline(qualified_at);
create index if not exists lead_pipeline_closed_at_idx on public.lead_pipeline(closed_at);
create index if not exists lead_notes_lead_idx on public.lead_notes(lead_id, created_at desc);
create index if not exists monthly_targets_period_idx on public.monthly_targets(period_start);

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
    where id = (select auth.uid()) and role = 'founder'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(coalesce(new.email, 'CRM user'), '@', 1)
    ),
    'lead_generator'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_new_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_pipeline (
    lead_id, owner_id, stage, stage_updated_by
  ) values (
    new.id, new.created_by, 'new', new.created_by
  );
  insert into public.lead_financials (lead_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_lead_created on public.leads;
create trigger on_lead_created
  after insert on public.leads
  for each row execute function public.handle_new_lead();

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

drop trigger if exists protect_lead_system_fields on public.leads;
create trigger protect_lead_system_fields
  before update on public.leads
  for each row execute function public.protect_lead_system_fields();

create or replace function public.track_pipeline_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_updated_at = now();
    new.stage_updated_by = auth.uid();

    if new.stage = 'qualified' and old.stage <> 'qualified' then
      new.qualified_at = coalesce(old.qualified_at, now());
      new.qualified_by = coalesce(old.qualified_by, auth.uid());
    end if;

    if new.stage in ('won', 'lost') then
      new.closed_at = now();
      new.closed_by = auth.uid();
    elsif old.stage in ('won', 'lost') then
      new.closed_at = null;
      new.closed_by = null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists track_pipeline_change on public.lead_pipeline;
create trigger track_pipeline_change
  before update on public.lead_pipeline
  for each row execute function public.track_pipeline_change();

create or replace function public.advance_lead_to_qualified(target_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (select 1 from public.profiles where id = caller_id) then
    raise exception 'CRM profile required';
  end if;

  update public.lead_pipeline
  set stage = 'qualified',
      stage_updated_by = caller_id,
      stage_updated_at = now(),
      qualified_by = caller_id,
      qualified_at = coalesce(qualified_at, now())
  where lead_id = target_lead_id and stage = 'new' and archived_at is null;

  if not found then
    raise exception 'Only an active New lead can be qualified';
  end if;

  update public.leads
  set qualification_status = 'qualified', updated_at = now()
  where id = target_lead_id;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads
for each row execute function public.set_updated_at();
drop trigger if exists financials_updated_at on public.lead_financials;
create trigger financials_updated_at before update on public.lead_financials
for each row execute function public.set_updated_at();
drop trigger if exists notes_updated_at on public.lead_notes;
create trigger notes_updated_at before update on public.lead_notes
for each row execute function public.set_updated_at();
drop trigger if exists targets_updated_at on public.monthly_targets;
create trigger targets_updated_at before update on public.monthly_targets
for each row execute function public.set_updated_at();
drop trigger if exists settings_updated_at on public.crm_settings;
create trigger settings_updated_at before update on public.crm_settings
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_pipeline enable row level security;
alter table public.lead_financials enable row level security;
alter table public.lead_notes enable row level security;
alter table public.monthly_targets enable row level security;
alter table public.crm_settings enable row level security;

drop policy if exists profiles_read_authenticated on public.profiles;
create policy profiles_read_authenticated on public.profiles
for select to authenticated using (true);

drop policy if exists leads_read_authenticated on public.leads;
create policy leads_read_authenticated on public.leads
for select to authenticated using (true);
drop policy if exists leads_insert_authenticated on public.leads;
create policy leads_insert_authenticated on public.leads
for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists leads_update_authenticated on public.leads;
create policy leads_update_authenticated on public.leads
for update to authenticated using (true) with check (true);
drop policy if exists leads_delete_founder_archived on public.leads;
create policy leads_delete_founder_archived on public.leads
for delete to authenticated using (
  (select private.is_founder())
  and exists (
    select 1 from public.lead_pipeline
    where lead_id = leads.id and archived_at is not null
  )
);

drop policy if exists pipeline_read_authenticated on public.lead_pipeline;
create policy pipeline_read_authenticated on public.lead_pipeline
for select to authenticated using (true);
drop policy if exists pipeline_update_founder on public.lead_pipeline;
create policy pipeline_update_founder on public.lead_pipeline
for update to authenticated
using ((select private.is_founder()))
with check ((select private.is_founder()));

drop policy if exists financials_founder_all on public.lead_financials;
create policy financials_founder_all on public.lead_financials
for all to authenticated
using ((select private.is_founder()))
with check ((select private.is_founder()));

drop policy if exists notes_read_authenticated on public.lead_notes;
create policy notes_read_authenticated on public.lead_notes
for select to authenticated using (true);
drop policy if exists notes_insert_authenticated on public.lead_notes;
create policy notes_insert_authenticated on public.lead_notes
for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists notes_update_owner_or_founder on public.lead_notes;
create policy notes_update_owner_or_founder on public.lead_notes
for update to authenticated
using (created_by = (select auth.uid()) or (select private.is_founder()))
with check (created_by = (select auth.uid()) or (select private.is_founder()));
drop policy if exists notes_delete_owner_or_founder on public.lead_notes;
create policy notes_delete_owner_or_founder on public.lead_notes
for delete to authenticated
using (created_by = (select auth.uid()) or (select private.is_founder()));

drop policy if exists targets_read_own_or_founder on public.monthly_targets;
create policy targets_read_own_or_founder on public.monthly_targets
for select to authenticated
using (profile_id = (select auth.uid()) or (select private.is_founder()));
drop policy if exists targets_write_founder on public.monthly_targets;
create policy targets_write_founder on public.monthly_targets
for all to authenticated
using ((select private.is_founder()))
with check ((select private.is_founder()));

drop policy if exists settings_founder_all on public.crm_settings;
create policy settings_founder_all on public.crm_settings
for all to authenticated
using ((select private.is_founder()))
with check ((select private.is_founder()));

revoke all on all tables in schema public from anon;
grant select on public.profiles, public.leads, public.lead_pipeline, public.lead_notes to authenticated;
grant insert, update, delete on public.leads, public.lead_notes to authenticated;
grant update on public.lead_pipeline to authenticated;
grant select, insert, update, delete on public.lead_financials to authenticated;
grant select, insert, update, delete on public.monthly_targets to authenticated;
grant select, update on public.crm_settings to authenticated;

grant usage on schema private to authenticated;
revoke all on function private.is_founder() from public, anon;
grant execute on function private.is_founder() to authenticated;
revoke all on function public.advance_lead_to_qualified(uuid) from public, anon;
grant execute on function public.advance_lead_to_qualified(uuid) to authenticated;

-- After creating Noor and Hiba in Authentication > Users, set their profiles:
-- update public.profiles set display_name = 'Noor Ul Hassan', role = 'founder'
-- where id = (select id from auth.users where email = 'noor@example.com');
-- update public.profiles set display_name = 'Hiba', role = 'lead_generator'
-- where id = (select id from auth.users where email = 'hiba@example.com');

commit;
