-- Preserve context and dated follow-up requirements with every pipeline move.
-- Apply after 202608030006_reconcile_pipeline_stage_values.sql.

begin;

alter table public.stage_history
  add column if not exists description text,
  add column if not exists follow_up_required boolean not null default false,
  add column if not exists follow_up_date date;

alter table public.stage_history
  drop constraint if exists stage_history_follow_up_date_required;
alter table public.stage_history
  add constraint stage_history_follow_up_date_required
  check (not follow_up_required or follow_up_date is not null);

comment on column public.stage_history.description is
  'User-entered context captured with this specific pipeline stage entry.';
comment on column public.stage_history.follow_up_required is
  'Whether this stage entry requires a dated follow-up.';
comment on column public.stage_history.follow_up_date is
  'Exact calendar date for the follow-up attached to this stage entry.';

create or replace function public.record_lead_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_description text := nullif(
    pg_catalog.current_setting('mypath.stage_description', true),
    ''
  );
  v_follow_up_required boolean := coalesce(
    nullif(
      pg_catalog.current_setting('mypath.stage_follow_up_required', true),
      ''
    )::boolean,
    false
  );
  v_follow_up_date date := nullif(
    pg_catalog.current_setting('mypath.stage_follow_up_date', true),
    ''
  )::date;
begin
  if new.current_pipeline_stage is distinct from old.current_pipeline_stage then
    if v_description is null then
      raise exception 'Move stages through move_lead_with_context and include a description'
        using errcode = '23514';
    end if;

    if v_follow_up_required and v_follow_up_date is null then
      raise exception 'Choose an exact follow-up date'
        using errcode = '23514';
    end if;

    insert into public.stage_history (
      lead_id,
      previous_stage,
      new_stage,
      changed_by,
      changed_at,
      description,
      follow_up_required,
      follow_up_date
    ) values (
      new.id,
      old.current_pipeline_stage,
      new.current_pipeline_stage,
      coalesce(auth.uid(), new.created_by),
      pg_catalog.now(),
      v_description,
      v_follow_up_required,
      v_follow_up_date
    );
  end if;
  return new;
end;
$$;

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
    changed_at,
    description,
    follow_up_required,
    follow_up_date
  ) values (
    new.id,
    null,
    new.current_pipeline_stage,
    coalesce(auth.uid(), new.created_by),
    new.created_at,
    'Lead created',
    false,
    null
  );
  return new;
end;
$$;

revoke all on function public.record_lead_stage_change() from public, anon, authenticated;
revoke all on function public.record_initial_lead_stage() from public, anon, authenticated;

create or replace function public.move_lead_with_context(
  p_lead_id uuid,
  p_new_stage public.pipeline_stage,
  p_proposed_value numeric default null,
  p_description text default null,
  p_follow_up_required boolean default false,
  p_follow_up_date date default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_stage public.pipeline_stage;
  v_description text := nullif(pg_catalog.btrim(p_description), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if v_description is null then
    raise exception 'Add a stage description before moving the lead'
      using errcode = '23514';
  end if;

  if p_follow_up_required and p_follow_up_date is null then
    raise exception 'Choose an exact follow-up date'
      using errcode = '23514';
  end if;

  select lead.current_pipeline_stage
  into v_current_stage
  from public.leads lead
  where lead.id = p_lead_id;

  if not found then
    raise exception 'Lead not found or not accessible' using errcode = 'P0002';
  end if;

  if v_current_stage = p_new_stage then
    raise exception 'Choose a different pipeline stage' using errcode = '23514';
  end if;

  perform pg_catalog.set_config('mypath.stage_description', v_description, true);
  perform pg_catalog.set_config(
    'mypath.stage_follow_up_required',
    p_follow_up_required::text,
    true
  );
  perform pg_catalog.set_config(
    'mypath.stage_follow_up_date',
    coalesce(p_follow_up_date::text, ''),
    true
  );

  if p_proposed_value is null then
    update public.leads
    set current_pipeline_stage = p_new_stage
    where id = p_lead_id;
  else
    update public.leads
    set
      current_pipeline_stage = p_new_stage,
      proposed_value = p_proposed_value
    where id = p_lead_id;
  end if;
end;
$$;

revoke all on function public.move_lead_with_context(
  uuid, public.pipeline_stage, numeric, text, boolean, date
) from public, anon;
grant execute on function public.move_lead_with_context(
  uuid, public.pipeline_stage, numeric, text, boolean, date
) to authenticated;

-- Keep the authorised lead graph in sync with the richer history records.
create or replace view public.crm_leads
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
where auth.uid() is not null
  and exists (
    select 1
    from public.profiles authorised_profile
    where authorised_profile.id = auth.uid()
      and authorised_profile.role in ('founder', 'lead_generator')
  );

revoke all on public.crm_leads from public, anon;
grant select on public.crm_leads to authenticated;

commit;
