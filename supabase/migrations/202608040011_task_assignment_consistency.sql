-- Keep assigned work consistent with permanent task and lead deletion.
-- Apply after 202608040010_safe_team_member_removal.sql.

begin;

-- Tasks are operational children of a lead. Archiving a lead retains them, while
-- the Founder-only permanent lead deletion removes linked tasks and their event
-- history through the existing task_events -> crm_tasks cascade.
alter table public.crm_tasks
  drop constraint if exists crm_tasks_lead_id_fkey;

alter table public.crm_tasks
  add constraint crm_tasks_lead_id_fkey
  foreign key (lead_id)
  references public.leads(id)
  on delete cascade;

comment on constraint crm_tasks_lead_id_fkey on public.crm_tasks is
  'Retains tasks while a lead is archived; permanently deleting the lead cascades to its tasks and task events.';

commit;
