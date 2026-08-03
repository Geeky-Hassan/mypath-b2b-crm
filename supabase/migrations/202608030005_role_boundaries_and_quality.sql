-- Enforce the original V1 role boundaries and remaining data-quality rules.
-- Paste this entire file after 202608030004_v1_hardening.sql succeeds.

begin;

do $$
begin
  if to_regclass('public.crm_leads') is not null then
    raise exception using
      errcode = '55000',
      message = 'V1 role boundaries are already installed; do not rerun migration 5';
  end if;
end
$$;

-- Lead Generators may enrich shared company/contact/qualification data and may
-- perform the explicit Lead Added -> Qualified transition. Founder-owned sales,
-- lifecycle, follow-up, demo, financial, archive, and close fields are protected.
create or replace function public.enforce_lead_role_boundaries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SQL administrators and trusted maintenance jobs do not carry an Auth user.
  if auth.uid() is null or (select private.is_founder()) then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'lead_generator'
  ) then
    raise exception using
      errcode = '42501',
      message = 'An authorised CRM role is required';
  end if;

  if tg_op = 'INSERT' then
    if new.current_pipeline_stage <> 'lead_added'
      or new.lifecycle_status <> 'active'
      or new.first_contacted_at is not null
      or new.last_contacted_at is not null
      or new.next_action is not null
      or new.next_action_date is not null
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
    or new.first_contacted_at is distinct from old.first_contacted_at
    or new.last_contacted_at is distinct from old.last_contacted_at
    or new.next_action is distinct from old.next_action
    or new.next_action_date is distinct from old.next_action_date
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

drop trigger if exists enforce_lead_role_boundaries on public.leads;
create trigger enforce_lead_role_boundaries
before insert or update on public.leads
for each row execute function public.enforce_lead_role_boundaries();

revoke all on function public.enforce_lead_role_boundaries()
  from public, anon, authenticated;

-- Target values represent event counts, and their date ranges must match their
-- declared period rather than an arbitrary interval.
alter table public.targets
  add constraint targets_positive_whole_value
  check (target_value > 0 and target_value = trunc(target_value)) not valid;

alter table public.targets
  add constraint targets_period_matches_dates
  check (
    (
      period_type = 'weekly'
      and end_date = start_date + 6
    )
    or (
      period_type = 'monthly'
      and start_date = date_trunc('month', start_date)::date
      and end_date = (start_date + interval '1 month - 1 day')::date
    )
  ) not valid;

-- All lead reads go through this authorised projection. The view keeps the
-- existing read model while returning financial fields only to the Founder.
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
where auth.uid() is not null
  and exists (
    select 1
    from public.profiles authorised_profile
    where authorised_profile.id = auth.uid()
      and authorised_profile.role in ('founder', 'lead_generator')
  );

revoke all on public.crm_leads from public, anon;
grant select on public.crm_leads to authenticated;

-- The authenticated Postgres role is shared by both app roles. Restrict direct
-- table reads to non-financial columns; the authorised view supplies conditional
-- financial values to the Founder.
revoke select on public.leads from authenticated;
grant select (
  id,
  company_name,
  website,
  country,
  region,
  customer_segment,
  company_size,
  education_offering,
  current_lms_or_tools,
  contact_name,
  job_title,
  email,
  linkedin_url,
  decision_maker_status,
  main_pain_point,
  reason_mypath_is_relevant,
  current_alternative,
  budget_indicator,
  qualification_score,
  priority,
  source,
  owner_id,
  created_by,
  current_pipeline_stage,
  lifecycle_status,
  date_added,
  first_contacted_at,
  last_contacted_at,
  next_action,
  next_action_date,
  demo_date,
  lost_reason,
  notes,
  created_at,
  updated_at
) on public.leads to authenticated;

commit;
