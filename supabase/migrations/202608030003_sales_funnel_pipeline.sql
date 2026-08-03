-- Replace the original seven-stage deal pipeline with MyPath's operational sales funnel.
-- Paste this entire file after 202608030002_expand_lead_management.sql succeeds.

begin;

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'pipeline_stage'
      and e.enumlabel = 'lead_added'
  ) then
    raise exception using
      errcode = '55000',
      message = 'The detailed sales funnel already exists; do not rerun migration 3';
  end if;
end
$$;

drop trigger if exists sync_lead_lifecycle_from_stage on public.leads;
drop trigger if exists record_lead_stage_change on public.leads;
drop trigger if exists record_initial_lead_stage on public.leads;
drop function if exists public.sync_lead_lifecycle_from_stage();
drop function if exists public.record_lead_stage_change();
drop function if exists public.record_initial_lead_stage();

-- Lost is now a lifecycle state rather than a pipeline stage. Preserve the most recent
-- pre-loss stage where history exists; otherwise return the lead to Lead Added.
update public.leads l
set current_pipeline_stage = coalesce(
  (
    select h.previous_stage
    from public.stage_history h
    where h.lead_id = l.id
      and h.new_stage = 'lost'
      and h.previous_stage is not null
      and h.previous_stage <> 'lost'
    order by h.changed_at desc
    limit 1
  ),
  'new'::public.pipeline_stage
)
where l.current_pipeline_stage = 'lost';

insert into public.lead_activities (
  lead_id,
  activity_type,
  activity_date,
  summary,
  notes,
  created_by,
  created_at
)
select
  h.lead_id,
  'note',
  h.changed_at,
  'Legacy lifecycle change: Lost',
  'Preserved from the former pipeline Lost stage during the funnel migration.',
  h.changed_by,
  h.changed_at
from public.stage_history h
where h.new_stage = 'lost';

delete from public.stage_history where new_stage = 'lost';

alter type public.pipeline_stage rename to pipeline_stage_legacy;

create type public.pipeline_stage as enum (
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
);

alter table public.leads alter column current_pipeline_stage drop default;
alter table public.leads
  alter column current_pipeline_stage type public.pipeline_stage
  using (
    case current_pipeline_stage::text
      when 'new' then 'lead_added'
      when 'qualified' then 'qualified'
      when 'discovery' then 'discovery_call_booked'
      when 'proposal' then 'paid_pilot_proposal_sent'
      when 'negotiation' then 'negotiation'
      when 'won' then 'paid_pilot_won'
      else 'lead_added'
    end
  )::public.pipeline_stage;
alter table public.leads
  alter column current_pipeline_stage set default 'lead_added'::public.pipeline_stage;

alter table public.stage_history
  alter column previous_stage type public.pipeline_stage
  using (
    case
      when previous_stage is null or previous_stage::text = 'lost' then null
      when previous_stage::text = 'new' then 'lead_added'
      when previous_stage::text = 'qualified' then 'qualified'
      when previous_stage::text = 'discovery' then 'discovery_call_booked'
      when previous_stage::text = 'proposal' then 'paid_pilot_proposal_sent'
      when previous_stage::text = 'negotiation' then 'negotiation'
      when previous_stage::text = 'won' then 'paid_pilot_won'
      else 'lead_added'
    end
  )::public.pipeline_stage;

alter table public.stage_history
  alter column new_stage type public.pipeline_stage
  using (
    case new_stage::text
      when 'new' then 'lead_added'
      when 'qualified' then 'qualified'
      when 'discovery' then 'discovery_call_booked'
      when 'proposal' then 'paid_pilot_proposal_sent'
      when 'negotiation' then 'negotiation'
      when 'won' then 'paid_pilot_won'
      else 'lead_added'
    end
  )::public.pipeline_stage;

drop type public.pipeline_stage_legacy;

-- Explicit business requirements are enforced for future writes. NOT VALID keeps
-- legacy rows intact until users supply any missing values.
alter table public.leads
  add constraint leads_lost_reason_required
  check (
    lifecycle_status <> 'lost'
    or (lost_reason is not null and length(trim(lost_reason)) > 0)
  ) not valid;

alter table public.leads
  add constraint leads_value_required_for_commercial_stages
  check (
    current_pipeline_stage not in (
      'paid_pilot_proposal_sent',
      'negotiation',
      'paid_pilot_won',
      'recurring_contract_won'
    )
    or (proposed_value is not null and proposed_value > 0)
  ) not valid;

create or replace function public.sync_lead_lifecycle_from_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.current_pipeline_stage is distinct from old.current_pipeline_stage then
    if new.current_pipeline_stage in ('paid_pilot_won', 'recurring_contract_won') then
      new.lifecycle_status = 'won';
    elsif old.lifecycle_status in ('won', 'lost') then
      new.lifecycle_status = 'active';
      new.lost_reason = null;
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

create or replace function public.record_initial_lead_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stage_history (
    lead_id, previous_stage, new_stage, changed_by, changed_at
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

create trigger sync_lead_lifecycle_from_stage
before update of current_pipeline_stage on public.leads
for each row execute function public.sync_lead_lifecycle_from_stage();

create trigger record_lead_stage_change
after update of current_pipeline_stage on public.leads
for each row execute function public.record_lead_stage_change();

create trigger record_initial_lead_stage
after insert on public.leads
for each row execute function public.record_initial_lead_stage();

-- Founder-entered period costs support CAC without guessing missing spend.
create table public.sales_costs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  sales_cost numeric(14, 2) not null check (sales_cost >= 0),
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_start, period_end)
);

create trigger sales_costs_updated_at
before update on public.sales_costs
for each row execute function public.set_updated_at();

alter table public.sales_costs enable row level security;

create policy sales_costs_founder_all on public.sales_costs
for all to authenticated
using ((select private.is_founder()))
with check ((select private.is_founder()) and created_by = (select auth.uid()));

revoke all on public.sales_costs from anon;
grant select, insert, update, delete on public.sales_costs to authenticated;

create index sales_costs_period_idx
on public.sales_costs(period_start, period_end);

-- Preserve compatible V1 targets under the new operational names. Legacy won-value
-- rows stay stored for audit history but are not exposed by the V2 target interface.
update public.targets set target_type = 'leads_added'
where target_type = 'leads_created';
update public.targets set target_type = 'paid_pilots_won'
where target_type = 'won_deals';

alter table public.targets
  add constraint targets_supported_type
  check (
    target_type in (
      'leads_added',
      'qualified_leads',
      'leads_contacted',
      'replies',
      'discovery_calls_booked',
      'demos_booked',
      'proposals_sent',
      'paid_pilots_won'
    )
  ) not valid;

-- Currency is needed to label shared pipeline values. Both roles may read the
-- singleton setting; only the founder may change it.
drop policy if exists settings_founder_all on public.crm_settings;
create policy settings_read_authenticated on public.crm_settings
for select to authenticated using (true);
create policy settings_update_founder on public.crm_settings
for update to authenticated
using ((select private.is_founder()))
with check ((select private.is_founder()));

commit;
