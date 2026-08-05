-- Add production-safe lead workflow improvements without replacing existing records.
-- Apply after 202608040011_task_assignment_consistency.sql.

begin;

alter type public.lead_source add value if not exists 'google';
alter type public.lead_source add value if not exists 'ai';

-- Preserve the relative meaning of existing 0-100 scores on the new 0-11 scale.
update public.leads
set qualification_score = round(qualification_score::numeric * 11 / 100)::integer
where qualification_score is not null;

alter table public.leads
  drop constraint if exists leads_qualification_score_check;
alter table public.leads
  drop constraint if exists leads_qualification_score_range;
alter table public.leads
  add constraint leads_qualification_score_range
  check (qualification_score between 0 and 11);

-- Lead Generators may maintain founder-readiness follow-up fields and may archive
-- or restore a record only as part of the safeguarded deletion workflow. Other
-- sales, lifecycle, commercial, and close fields remain Founder-owned.
create or replace function public.enforce_lead_role_boundaries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or (select private.is_founder()) then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'lead_generator'
      and account_status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active CRM role is required';
  end if;

  if tg_op = 'INSERT' then
    if new.current_pipeline_stage <> 'lead_added'
      or new.lifecycle_status <> 'active'
      or new.first_contacted_at is not null
      or new.last_contacted_at is not null
      or new.demo_date is not null
      or new.proposed_value is not null
      or new.expected_close_date is not null
      or new.lost_reason is not null then
      raise exception using
        errcode = '42501',
        message = 'Lead Generators can create active leads at Lead Added only';
    end if;
    return new;
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status
    and not (
      new.lifecycle_status = 'archived'
      or (old.lifecycle_status = 'archived' and new.lifecycle_status = 'active')
    ) then
    raise exception using
      errcode = '42501',
      message = 'Lead Generators may only archive a lead or restore it to active';
  end if;

  if new.first_contacted_at is distinct from old.first_contacted_at
    or new.last_contacted_at is distinct from old.last_contacted_at
    or new.demo_date is distinct from old.demo_date
    or new.proposed_value is distinct from old.proposed_value
    or new.expected_close_date is distinct from old.expected_close_date
    or new.lost_reason is distinct from old.lost_reason then
    raise exception using
      errcode = '42501',
      message = 'This sales or lifecycle field requires the Founder role';
  end if;

  if new.current_pipeline_stage is distinct from old.current_pipeline_stage
    and not (
      old.current_pipeline_stage = 'lead_added'
      and new.current_pipeline_stage = 'qualified'
    ) then
    raise exception using
      errcode = '42501',
      message = 'Lead Generators may only move Lead Added to Qualified';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_lead_role_boundaries()
  from public, anon, authenticated;

create or replace function public.delete_archived_lead(
  p_lead_id uuid,
  p_expected_company_name text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_name text;
  v_deleted integer := 0;
begin
  if not (select private.can_use_crm()) then
    raise exception using
      errcode = '42501',
      message = 'An active Founder or Lead Generator account is required';
  end if;

  if p_lead_id is null or p_expected_company_name is null then
    raise exception using
      errcode = '22023',
      message = 'Lead ID and exact company name are required';
  end if;

  select company_name
  into v_company_name
  from public.leads
  where id = p_lead_id
    and lifecycle_status = 'archived'
  for update;

  if not found then
    return 0;
  end if;

  if p_expected_company_name is distinct from v_company_name then
    raise exception using
      errcode = '22023',
      message = 'The company name confirmation does not match';
  end if;

  delete from public.leads where id = p_lead_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke delete on public.leads from authenticated;
drop policy if exists leads_delete_founder_archived on public.leads;

revoke all on function public.delete_archived_lead(uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_archived_lead(uuid, text)
  to authenticated;

comment on function public.delete_archived_lead(uuid, text) is
  'Permanently deletes one archived lead after active-role and exact-name verification.';

commit;
