-- Founder-managed direct login credentials.
-- Apply after 202608030008_team_operations.sql, then redeploy team-admin.

begin;

-- Earlier account-management builds marked new and reset passwords as
-- temporary. V1 now treats the password chosen by the Founder as the user's
-- login password, so clear any pending onboarding flags left by that flow.
update public.profiles
set must_change_password = false,
    updated_at = now()
where must_change_password;

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
  );
$$;

comment on column public.profiles.must_change_password is
  'Deprecated onboarding flag retained for schema compatibility. Founder-set passwords are immediately usable.';

-- Remove a personal name from the optional stable sample journey when that
-- earlier seed version was used. This does not alter real user profiles.
update public.stage_history
set description = 'The Lead Generator found the organisation while researching higher-education providers expanding online programmes.'
where id = '11000000-0000-4000-8000-000000000001'
  and lead_id = '10000000-0000-4000-8000-000000000001';

commit;
