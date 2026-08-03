-- Reconcile a completed V1 database after legacy labels were appended to the
-- pipeline_stage enum by an attempted rerun of migration 1.
-- Apply only after 202608030005_role_boundaries_and_quality.sql.

begin;

do $$
begin
  if to_regclass('public.crm_leads') is null then
    raise exception using
      errcode = '55000',
      message = 'The completed V1 schema is required before pipeline reconciliation';
  end if;

  if exists (
    select 1
    from public.leads
    where current_pipeline_stage::text in ('new', 'discovery', 'proposal', 'won', 'lost')
  ) then
    raise exception using
      errcode = '23514',
      message = 'A lead uses an obsolete pipeline value; reconcile that lead before continuing';
  end if;

  if exists (
    select 1
    from public.stage_history
    where previous_stage::text in ('new', 'discovery', 'proposal', 'won', 'lost')
      or new_stage::text in ('new', 'discovery', 'proposal', 'won', 'lost')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Stage history uses an obsolete pipeline value; reconcile that history before continuing';
  end if;
end
$$;

alter table public.leads
  drop constraint if exists leads_supported_pipeline_stage;
alter table public.leads
  add constraint leads_supported_pipeline_stage
  check (
    current_pipeline_stage::text in (
      'lead_added',
      'qualified',
      'contacted',
      'replied',
      'initial_discussion',
      'follow_up_required',
      'discovery_call_booked',
      'discovery_call_completed',
      'demo_booked',
      'demo_completed',
      'paid_pilot_proposal_sent',
      'negotiation',
      'paid_pilot_won',
      'recurring_contract_won'
    )
  );

alter table public.stage_history
  drop constraint if exists stage_history_supported_previous_stage;
alter table public.stage_history
  add constraint stage_history_supported_previous_stage
  check (
    previous_stage is null
    or previous_stage::text in (
      'lead_added',
      'qualified',
      'contacted',
      'replied',
      'initial_discussion',
      'follow_up_required',
      'discovery_call_booked',
      'discovery_call_completed',
      'demo_booked',
      'demo_completed',
      'paid_pilot_proposal_sent',
      'negotiation',
      'paid_pilot_won',
      'recurring_contract_won'
    )
  );

alter table public.stage_history
  drop constraint if exists stage_history_supported_new_stage;
alter table public.stage_history
  add constraint stage_history_supported_new_stage
  check (
    new_stage::text in (
      'lead_added',
      'qualified',
      'contacted',
      'replied',
      'initial_discussion',
      'follow_up_required',
      'discovery_call_booked',
      'discovery_call_completed',
      'demo_booked',
      'demo_completed',
      'paid_pilot_proposal_sent',
      'negotiation',
      'paid_pilot_won',
      'recurring_contract_won'
    )
  );

commit;
