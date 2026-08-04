-- Read-only production readiness checks for MyPath CRM.
-- Run after all migrations and before a large CSV import. This script changes no data.

with checks as (
  select
    10 as display_order,
    'migration_10_functions'::text as check_name,
    'fail'::text as severity,
    to_regprocedure('public.delete_crm_task(uuid)') is not null
      and to_regprocedure(
        'public.remove_lead_generator_account(uuid,uuid)'
      ) is not null as passed,
    'Task cleanup and team-member removal functions are installed.'::text as details

  union all

  select
    20,
    'task_event_cascade',
    'fail',
    exists (
      select 1
      from pg_constraint constraint_row
      where constraint_row.contype = 'f'
        and constraint_row.conrelid = 'public.task_events'::regclass
        and constraint_row.confrelid = 'public.crm_tasks'::regclass
        and constraint_row.confdeltype = 'c'
    ),
    'Deleting a task also deletes its task-event history.'

  union all

  select
    30,
    'rls_enabled',
    'fail',
    not exists (
      select 1
      from (
        values
          ('profiles'),
          ('leads'),
          ('lead_activities'),
          ('stage_history'),
          ('targets'),
          ('sales_costs'),
          ('crm_settings'),
          ('crm_tasks'),
          ('task_events')
      ) as required_table(table_name)
      left join pg_class table_class
        on table_class.oid = to_regclass('public.' || required_table.table_name)
      where table_class.oid is null or not table_class.relrowsecurity
    ),
    'Every exposed CRM table has Row Level Security enabled.'

  union all

  select
    40,
    'anonymous_table_grants',
    'fail',
    not exists (
      select 1
      from information_schema.role_table_grants table_grant
      where table_grant.table_schema = 'public'
        and table_grant.grantee in ('anon', 'PUBLIC')
        and table_grant.table_name in (
          'profiles',
          'leads',
          'lead_activities',
          'stage_history',
          'targets',
          'sales_costs',
          'crm_settings',
          'crm_tasks',
          'task_events',
          'crm_leads'
        )
    ),
    'Anonymous and PUBLIC roles have no direct CRM table/view grants.'

  union all

  select
    50,
    'rls_policy_whitelist',
    'fail',
    not exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename in (
          'profiles',
          'leads',
          'lead_activities',
          'stage_history',
          'targets',
          'sales_costs',
          'crm_settings',
          'crm_tasks',
          'task_events'
        )
        and policy_row.policyname not in (
          'profiles_read_authenticated',
          'profiles_update_own_or_founder',
          'leads_read_authenticated',
          'leads_insert_authenticated',
          'leads_update_authenticated',
          'leads_delete_founder_archived',
          'lead_activities_read_authenticated',
          'lead_activities_insert_authenticated',
          'lead_activities_update_own_or_founder',
          'lead_activities_delete_own_or_founder',
          'stage_history_read_authenticated',
          'targets_read_own_or_founder',
          'targets_insert_founder',
          'targets_update_founder',
          'targets_delete_founder',
          'sales_costs_founder_all',
          'settings_read_authenticated',
          'settings_update_founder',
          'crm_tasks_read_assignee_or_founder',
          'crm_tasks_insert_founder',
          'crm_tasks_update_assignee_or_founder',
          'crm_tasks_delete_founder',
          'task_events_read_assignee_or_founder'
        )
    ),
    'No unexpected permissive policy remains from an old or partial migration.'

  union all

  select
    60,
    'account_cleanup_function_grants',
    'fail',
    not has_function_privilege(
      'anon',
      'public.remove_lead_generator_account(uuid,uuid)',
      'execute'
    )
      and not has_function_privilege(
        'authenticated',
        'public.remove_lead_generator_account(uuid,uuid)',
        'execute'
      ),
    'Only the server-side account service can invoke member cleanup.'

  union all

  select
    70,
    'orphan_task_events',
    'fail',
    not exists (
      select 1
      from public.task_events event_row
      left join public.crm_tasks task_row on task_row.id = event_row.task_id
      where task_row.id is null
    ),
    'Every task event belongs to an existing task.'

  union all

  select
    80,
    'lead_stage_history_alignment',
    'fail',
    not exists (
      select 1
      from public.leads lead_row
      left join lateral (
        select history.new_stage
        from public.stage_history history
        where history.lead_id = lead_row.id
        order by history.changed_at desc, history.id desc
        limit 1
      ) latest_history on true
      where latest_history.new_stage is null
        or latest_history.new_stage is distinct from lead_row.current_pipeline_stage
    ),
    'Every lead has history and its latest stage matches the lead record.'

  union all

  select
    90,
    'removed_or_disabled_lead_owners',
    'warning',
    not exists (
      select 1
      from public.leads lead_row
      join public.profiles owner_profile on owner_profile.id = lead_row.owner_id
      where owner_profile.account_status <> 'active'
    ),
    'All lead owners currently have active CRM access.'

  union all

  select
    100,
    'duplicate_contact_emails',
    'warning',
    not exists (
      select 1
      from public.leads
      where nullif(trim(email), '') is not null
      group by lower(trim(email))
      having count(*) > 1
    ),
    'No existing leads share a normalized contact email.'

  union all

  select
    110,
    'duplicate_websites',
    'warning',
    not exists (
      select 1
      from public.leads
      where nullif(trim(website), '') is not null
      group by lower(
        split_part(
          regexp_replace(trim(website), '^https?://(www\.)?', '', 'i'),
          '/',
          1
        )
      )
      having count(*) > 1
    ),
    'No existing leads share a normalized website hostname.'
)
select
  case
    when passed then 'PASS'
    when severity = 'warning' then 'WARNING'
    else 'FAIL'
  end as status,
  check_name,
  details
from checks
order by display_order;
