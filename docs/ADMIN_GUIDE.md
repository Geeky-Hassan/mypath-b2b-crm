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
password, disable/reactivate access, and edit work descriptions. Accounts with
CRM audit ownership are disabled rather than deleted. Additional Founder
accounts remain a manual Supabase operation.

### Replacing an old test account

Named Lead Generator accounts are not created by migrations or seed data. If an
old test Auth user already exists, its record lives in Supabase rather than this
repository:

1. Disable it from **Settings > Users & access** so RLS blocks its existing
   sessions immediately.
2. If it has no leads, activities, stage history, targets, tasks, or other audit
   references, delete it from **Supabase > Authentication > Users**.
3. If Supabase refuses deletion because CRM records reference the profile, keep
   it disabled to preserve history. Either reuse it with **Reset password** then
   **Reactivate**, or remove the associated demonstration records through the
   CRM before deleting the unused Auth user.
4. Add the replacement from **Settings > Users & access**. Copy the credentials
   shown after creation and send them securely; the user can sign in directly.

Never delete or rewrite a profile that owns real audit history merely to reuse
an email address.

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
- Only a Founder can create/reset/disable/reactivate Lead Generator accounts
  through `team-admin`; a Lead Generator receives HTTP 403 for admin actions.
- A real stage update produces exactly one new history row with the authenticated user and a database timestamp.

## Data operations

- Use CRM archive for recoverable removal. Permanent lead deletion cascades to activities and stage history.
- Treat CSV export as a portability/reporting extract, not a full backup.
- Before migrations or bulk imports, take a database backup using the Supabase-supported backup or PostgreSQL dump workflow available for the project.
- Periodically test a restore into a separate project. A backup is not proven until restoration is verified.
- Keep Auth users and database data in the same recovery plan; a leads-only CSV cannot reconstruct user IDs or audit ownership.

## Incident and access handling

If a password is exposed, reset it in Supabase Auth. If an anon/publishable key is rotated, update local and hosting build variables and rebuild the SPA. If a service-role key is ever exposed, rotate it immediately; it bypasses RLS.

Review unexpected profile role changes, lead deletions, or stage-history gaps directly in the database audit timestamps. V1 has provenance fields but does not provide an immutable external audit log.
