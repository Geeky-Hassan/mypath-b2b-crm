-- MyPath CRM V1 security and audit hardening.
-- Paste this entire file after 202608030003_sales_funnel_pipeline.sql succeeds.

begin;

do $$
begin
  if to_regprocedure('public.protect_activity_system_fields()') is not null then
    raise exception using
      errcode = '55000',
      message = 'V1 hardening is already installed; do not rerun migration 4';
  end if;
end
$$;

-- Target progress is visible to the target owner, but only the founder manages goals.
drop policy if exists targets_insert_own_or_founder on public.targets;
drop policy if exists targets_update_own_or_founder on public.targets;
drop policy if exists targets_delete_own_or_founder on public.targets;
drop policy if exists targets_insert_founder on public.targets;
drop policy if exists targets_update_founder on public.targets;
drop policy if exists targets_delete_founder on public.targets;

create policy targets_insert_founder on public.targets
for insert to authenticated
with check ((select private.is_founder()));

create policy targets_update_founder on public.targets
for update to authenticated
using ((select private.is_founder()))
with check ((select private.is_founder()));

create policy targets_delete_founder on public.targets
for delete to authenticated
using ((select private.is_founder()));

-- Activity authorship and creation timestamps are audit data, not editable content.
create or replace function public.protect_activity_system_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.lead_id is distinct from old.lead_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Activity provenance fields cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_activity_system_fields on public.lead_activities;
create trigger protect_activity_system_fields
before update on public.lead_activities
for each row execute function public.protect_activity_system_fields();

-- Always derive the settings audit actor from the authenticated session.
create or replace function public.stamp_settings_updater()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_settings_updater on public.crm_settings;
create trigger stamp_settings_updater
before update on public.crm_settings
for each row execute function public.stamp_settings_updater();

-- Anonymous clients receive no CRM table privileges. RLS remains enabled on every
-- exposed table, and stage-history writes remain trigger-owned.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete on public.stage_history from authenticated;

-- Internal trigger helpers are not public RPC interfaces.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_profile_authorization_fields()
  from public, anon, authenticated;
revoke all on function public.protect_lead_system_fields()
  from public, anon, authenticated;
revoke all on function public.sync_lead_lifecycle_from_stage()
  from public, anon, authenticated;
revoke all on function public.record_lead_stage_change()
  from public, anon, authenticated;
revoke all on function public.record_initial_lead_stage()
  from public, anon, authenticated;
revoke all on function public.protect_activity_system_fields()
  from public, anon, authenticated;
revoke all on function public.stamp_settings_updater()
  from public, anon, authenticated;

commit;
