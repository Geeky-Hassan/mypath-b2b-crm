# MyPath CRM Administrator Guide

## Responsibilities

The administrator owns the Supabase project, user creation, role assignment, migration execution, environment configuration, and backups. The browser app uses only the Supabase URL and anon/publishable key. Never add a service-role key to `.env`, Cloudflare Pages, frontend source, or support screenshots.

## Migration order

Apply every migration in filename order through the Supabase SQL Editor or CLI:

1. `202608030001_initial_crm.sql`
2. `202608030002_expand_lead_management.sql`
3. `202608030003_sales_funnel_pipeline.sql`
4. `202608030004_v1_hardening.sql`
5. `202608030005_role_boundaries_and_quality.sql`
6. `202608030006_reconcile_pipeline_stage_values.sql`
7. `202608030007_stage_context_and_follow_up.sql`
8. `202608030008_team_operations.sql`
9. `202608040009_direct_login_account_access.sql`
10. `202608040010_safe_team_member_removal.sql`

Then deploy the authenticated Edge Function:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy team-admin
```

Keep JWT verification enabled. Hosted Supabase supplies the function's server
secrets. Never add `SUPABASE_SERVICE_ROLE_KEY` to Vite or Cloudflare Pages.
The CLI is pinned as an npm development dependency, so Windows users should run
it through `npx`; a global `supabase` command is not expected.

Do not rerun individual forward migrations against a partially migrated production database. Test the full sequence in a separate Supabase project before applying it to a database that contains live data.

## Optional sample data

After assigning Noor the Founder role, run the full
`supabase/seed.sql` file in the SQL Editor to add two demonstration leads. The
records include activities and contextual stage history so dashboards, journey
analytics, filters, and the pipeline can be reviewed immediately. The script is
transactional and rerunnable; stable IDs prevent duplicate sample records.

The script uses the first Founder and Lead Generator profiles it finds. If no
Lead Generator exists, it attributes both samples to the Founder; if no Founder
exists, it stops without inserting anything. The contacts use `.example`
domains. Keep the seed out of production unless demo data is intentionally
required.

## Create the Founder and Lead Generators

1. In **Authentication > Users**, create only the initial Founder manually with a real email address and strong password.
2. Auto-confirm the Founder so V1 does not need confirmation email delivery.
3. Disable public signup in Auth settings.
4. Run the following after replacing the Founder email:

```sql
update public.profiles
set full_name = 'Noor Ul Hassan', role = 'founder'
where id = (select id from auth.users where email = 'noor@your-domain.com');
```

New Auth users default to `lead_generator`. The profile update trigger prevents a browser session from changing its email, role, ID, or creation time.

After the first Founder is configured, create Lead Generators from **Settings >
Users & access**. The Founder may create or reset an immediately usable login
password, disable/reactivate access, edit work descriptions, or permanently
remove a Lead Generator. Additional Founder accounts remain a manual Supabase
operation.

### Removing a team member

Use **Disable** when access might be restored. Use **Remove** only after checking
the typed-email confirmation and impact summary. Permanent removal:

1. Quarantines and bans the Supabase Auth login, replaces its email with a
   reserved tombstone address, and frees the real email for a new account.
2. Deletes tasks assigned to that member; task-event history cascades with each
   task.
3. Deletes that member's targets.
4. Reassigns currently owned leads to the Founder performing removal.
5. Hides and anonymizes the person's CRM profile while retaining the UUID as
   “Former team member” for lead creation, activity, and stage-history audits.

The profile/Auth tombstone is intentionally retained internally. Hard-deleting
it would either destroy leads and history or break required foreign keys. It has
no CRM access and is not shown in Users, Team, owner selectors, or targets.
Database triggers also reject new lead, target, or task assignment to Disabled
or Removed accounts; existing historical ownership may remain until reassigned.

## Effective access matrix

| Resource      | Anonymous | Lead Generator                                                    | Founder                                    |
| ------------- | --------- | ----------------------------------------------------------------- | ------------------------------------------ |
| Profiles      | No access | Read all; update own name only                                    | Read all; update own name only             |
| Leads         | No access | Read shared non-financial data; create/enrich; Added -> Qualified | Full read/update; archive; delete archived |
| Activities    | No access | Read all; create; edit/delete own                                 | Read all; create; manage all               |
| Stage history | No access | Read only                                                         | Read only                                  |
| Targets       | No access | Read own only                                                     | Read and manage all                        |
| Sales costs   | No access | No access                                                         | Read and manage                            |
| CRM settings  | No access | Read                                                              | Read and update                            |
| Tasks         | No access | Read assigned; update status/note                                 | Create, assign, edit, cancel, delete       |
| Task events   | No access | Read events for assigned tasks                                    | Read all; trigger-owned writes             |
| Account admin | No access | No access                                                         | Manage Lead Generator Auth accounts        |

RLS is enabled on every exposed V1 table. Policies target `authenticated` and
require `private.can_use_crm()`: an Active authorised account.
The role-aware lead view and database triggers retain the financial, lifecycle,
archive, transition, and delete boundaries. Direct stage and task-event writes
are revoked; database triggers own those records.

## Manual security checks after migration

Use Founder and Lead Generator test sessions through the browser or Supabase JavaScript client. The SQL Editor normally runs with elevated privileges and is not a valid RLS test.

- Without a session, selects and mutations for every CRM table must fail or return no rows.
- A Lead Generator can read shared non-financial lead data and update company/contact/qualification fields.
- A Lead Generator can move Lead Added to Qualified, but later stage, lifecycle, follow-up, proposed-value, archive, and delete requests must fail or affect zero rows.
- A Lead Generator can read only personal target rows and cannot insert, update, or delete targets.
- A Lead Generator cannot read `sales_costs` or update `crm_settings`.
- Noor can start the delete flow from any lead. The UI requires archive first,
  then an exact company-name confirmation; the database still rejects deletion
  unless the row is archived.
- Neither browser session can insert, update, or delete `stage_history` directly.
- A disabled user cannot select CRM data, even with an older session.
- A Lead Generator sees only assigned tasks and cannot create, reassign, cancel, delete, or
  edit protected task details through direct Supabase requests.
- Only a Founder can create/reset/disable/reactivate/remove Lead Generator accounts
  through `team-admin`; a Lead Generator receives HTTP 403 for admin actions.
- Deleting a task removes its `task_events`; refresh Team and Tasks and confirm
  the task no longer contributes to member counts or recent activity.
- Removing a Lead Generator deletes their assigned tasks/targets, reassigns
  their owned leads, removes them from Team/User selectors, and blocks the old
  login. Historical lead/activity/stage actor labels become “Former team member.”
- A real stage update produces exactly one new history row with the authenticated user and a database timestamp.

## Data operations

- Use CRM archive for recoverable removal. Permanent lead deletion cascades to activities and stage history.
- Treat CSV export as a portability/reporting extract, not a full backup.
- Before migrations or bulk imports, take a database backup using the Supabase-supported backup or PostgreSQL dump workflow available for the project.
- Periodically test a restore into a separate project. A backup is not proven until restoration is verified.
- Keep Auth users and database data in the same recovery plan; a leads-only CSV cannot reconstruct user IDs or audit ownership.
- After migration 10 and before bulk import, run the read-only
  `supabase/verification/pre_import_readiness.sql` query. Resolve all `FAIL`
  results and review duplicate/disabled-owner `WARNING` results.

## Incident and access handling

If a password is exposed, reset it in Supabase Auth. If an anon/publishable key is rotated, update local and hosting build variables and rebuild the SPA. If a service-role key is ever exposed, rotate it immediately; it bypasses RLS.

Review unexpected profile role changes, lead deletions, or stage-history gaps directly in the database audit timestamps. V1 has provenance fields but does not provide an immutable external audit log.
