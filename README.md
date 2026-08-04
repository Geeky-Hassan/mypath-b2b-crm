# MyPath B2B CRM

An internal, desktop-first CRM for MyPath. The Founder and authorised Lead Generators share lead, contact, qualification, activity, and pipeline data, with Supabase Row Level Security enforcing authenticated access and founder-only permanent deletion.

## Stack

- React, Vite, TypeScript, and Tailwind CSS
- React Router
- Supabase Auth, Postgres, and Row Level Security
- React Hook Form and Zod
- PapaParse for CSV import/export
- libphonenumber-js for optional international contact phones
- dnd-kit for accessible pipeline movement
- Recharts for focused dashboard visualizations
- Vitest, ESLint, and Prettier

## Local setup

Requirements: Node.js 22.16 or newer, npm, and a Supabase project. The checked-in `.node-version` pins the release build version. `npm install` also installs the project-scoped Supabase CLI.

```bash
npm install
cp .env.example .env
npm run dev
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

Set these browser-safe values from Supabase Project Settings in `.env`:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Never place a service-role key in this application or commit a real `.env` file. Missing variables render an actionable configuration screen instead of crashing the SPA.

### Local acceptance check

After Supabase setup, run `npm run dev`, open the printed `http://localhost:5173` URL, and test with both accounts:

1. Sign in as a Lead Generator created from **Settings > Users & access**, review **My focus**, add a lead with an optional international phone, bulk-import a small CSV, complete an assigned task, and move Lead Added to Qualified. Confirm deal values, export, archive/delete, Team, and Settings are unavailable.
2. Sign in as Noor, add contact activity and a next action, move the lead through later stages, enter a proposed value for proposal/negotiation, mark a test lead lost with a reason, and archive/restore/delete an archived test lead.
3. Create one weekly and one monthly target; confirm the Lead Generator sees only personal targets and Noor sees both users.
4. Import a small template CSV, review mapping/invalid/duplicate states, export the filtered Leads view, and open the CSV in a spreadsheet.
5. Create a Lead Generator in **Settings > Users & access**, copy the generated credentials, verify direct login, then disable/reactivate access and refresh every application route.

Run the complete automated gate before accepting a change:

```bash
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
npm run preview
```

`npm run preview` serves the production build, normally at `http://localhost:4173`. Live authentication and RLS can only be proven against a configured Supabase project; the SQL Editor runs as an elevated database role and must not be used as the RLS test client.

## Supabase setup

Apply the migrations in filename order using the Supabase SQL Editor or CLI:

1. `supabase/migrations/202608030001_initial_crm.sql`
2. `supabase/migrations/202608030002_expand_lead_management.sql`
3. `supabase/migrations/202608030003_sales_funnel_pipeline.sql`
4. `supabase/migrations/202608030004_v1_hardening.sql`
5. `supabase/migrations/202608030005_role_boundaries_and_quality.sql`
6. `supabase/migrations/202608030006_reconcile_pipeline_stage_values.sql`
7. `supabase/migrations/202608030007_stage_context_and_follow_up.sql`
8. `supabase/migrations/202608030008_team_operations.sql`
9. `supabase/migrations/202608040009_direct_login_account_access.sql`
10. `supabase/migrations/202608040010_safe_team_member_removal.sql`
11. `supabase/migrations/202608040011_task_assignment_consistency.sql`

Deploy the authenticated account-administration function after applying all 11 migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy team-admin
```

Hosted Supabase supplies the function's server secrets. Never copy the
service-role key into Vite or Cloudflare. Keep JWT verification enabled.

Then:

1. Keep email/password authentication enabled and disable public signup.
2. Create only the initial Founder manually in Authentication → Users, with a strong password and auto-confirm enabled.
3. Assign the Founder name and role after replacing the example email:

```sql
update public.profiles
set full_name = 'Noor Ul Hassan', role = 'founder'
where id = (select id from auth.users where email = 'noor@your-domain.com');
```

If the Auth users existed before the migrations, upsert their profiles:

```sql
insert into public.profiles (id, full_name, email, role)
select id, 'Noor Ul Hassan', email, 'founder'::public.user_role
from auth.users where email = 'noor@your-domain.com'
on conflict (id) do update
set full_name = excluded.full_name, email = excluded.email, role = excluded.role;
```

After the Founder can sign in, create every Lead Generator from **Settings >
Users & access**. The Founder supplies the name, email, work details, and login
password. The account is email-confirmed server-side and can sign in immediately
with those credentials; no user-side password change is required.

Existing test Auth users are not stored in this repository. Use **Disable** for
a reversible access pause or **Remove** for permanent, audit-safe removal. The
Remove flow deletes assigned tasks and targets, reassigns owned leads to the
Founder, frees the login email, and anonymizes historical authorship. See
[ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md#removing-a-team-member).

### Optional sample leads

After the Founder profile exists, run the complete
[`supabase/seed.sql`](supabase/seed.sql) file in the Supabase SQL Editor. It adds
two realistic leads at different journey stages, including activities, dated
stage history, descriptions, values, and upcoming follow-ups. The seed uses the
first Founder and Lead Generator profiles it finds, contains no Auth passwords,
and is rerunnable without duplicating its stable sample records.

The sample contacts use reserved `.example` domains and cannot receive email.
Do not run optional sample data in a production project unless demonstration
records are intentionally wanted.

If the seed reports that stage context or `crm_tasks` does not exist, migrations
7 or 8 have not been applied completely. Run both in order, then rerun `seed.sql`.
The seed is transactional, so a failed attempt leaves no partial sample batch.

No SMTP, email templates, Storage bucket, OAuth provider, or browser-side
service-role key is required. The `team-admin` Edge Function is required for
in-app Lead Generator administration.

### Windows: `supabase` is not recognized

The CLI is intentionally installed as a project dependency, not as a global
Windows command. Run it from this repository through `npx`:

```bat
cd C:\Office-work\mypath-b2-crm
npm install
npx supabase --version
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy team-admin
```

Find `YOUR_PROJECT_REF` in the Supabase dashboard URL:
`https://supabase.com/dashboard/project/YOUR_PROJECT_REF`. Linking or deploying
the hosted Function does not require Docker. Do not add `--no-verify-jwt`; this
Function must remain authenticated.

## Commands

```bash
npm run dev          # local development
npm run lint         # ESLint
npm run typecheck    # TypeScript without emitting files
npm test             # Vitest test suite
npm run format       # apply Prettier formatting
npm run format:check # verify formatting
npm run build        # production build
npm run preview      # preview the production build
```

## Roles

Founder:

- Views the full dashboard, shared leads, pipeline, and deal values.
- Assigns tasks, reviews factual Team activity, manages targets, imports/exports,
  and administers Lead Generator access.
- Can choose **Delete** on any lead; the guided flow requires archiving first and
  then typing the exact company name before permanent deletion.

Lead Generator:

- Creates and edits shared company, contact, qualification, owner, notes, and activity data.
- Views the shared pipeline and may move only Lead Added to Qualified.
- Imports CSV leads, manages assigned task status, and sees personal targets;
  cannot export, view deal values, archive/delete leads, or access founder-only routes.

Founder-created and Founder-reset passwords are immediately usable login
passwords. Disabled accounts receive no CRM data access even if an older JWT
remains valid; reactivation restores access without requiring another password
change.

The founder dashboard, sales contact/follow-up fields, lifecycle controls, deal values, archive actions, sales-cost entry, and expected-close input are founder-specific. Migration `202608030005_role_boundaries_and_quality.sql` enforces these boundaries in PostgreSQL as well as the UI and exposes a role-aware read projection that returns financial fields only to the founder.

## Sales funnel

The operational board has 14 detailed stages grouped into Awareness, Interest, Consideration, Decision, and Action and Retention. Dragging a lead updates its current stage in one database write, and a trigger records the actor, previous stage, next stage, and time in `stage_history`.

Lost remains a separate lifecycle state and requires a reason. Entering Paid-Pilot Proposal Sent, Negotiation, Paid Pilot Won, or Recurring Contract Won requires a positive proposed value. Other missing information produces warnings without blocking movement.

## CSV workflow

The Founder example and blank files are at
[`public/templates/mypath-leads-template.csv`](public/templates/mypath-leads-template.csv)
and
[`public/templates/mypath-leads-blank-template.csv`](public/templates/mypath-leads-blank-template.csv).
The import screen also accepts drag-and-drop and other CSV layouts through
explicit column mapping. Files are limited to 5 MB and 5,000 rows per batch.
The preview rejects duplicate source mappings, validates required and typed
values, resolves owner email, reports invalid rows, warns on normalized company
website or contact email duplicates, and offers a downloadable row report before
confirmation. Accepted rows are sent in one PostgreSQL insert, so a database
failure rolls back the accepted batch rather than leaving a partial import.

Template columns, in order:

```text
company_name, website, country, region, customer_segment, company_size,
education_offering, current_lms_or_tools, contact_name, job_title, email, contact_phone,
linkedin_url, decision_maker_status, main_pain_point,
reason_mypath_is_relevant, current_alternative, budget_indicator,
qualification_score, priority, source, owner_email, current_pipeline_stage,
lifecycle_status, date_added, first_contacted_at, last_contacted_at,
next_action, next_action_date, demo_date, proposed_value,
expected_close_date, lost_reason, notes
```

`company_name` is required. Blank owner email defaults to the importing user. Enum values must use the database forms documented by the template: priority `low|medium|high`, source `email|linkedin|referral|event|other`, lifecycle `active|nurture|won|lost|archived`, and one of the detailed pipeline values documented in `docs/PRODUCT_SPEC.md`.

The Lead Generator template is
[`public/templates/mypath-lead-generator-template.csv`](public/templates/mypath-lead-generator-template.csv).
An example-free version is available at
[`public/templates/mypath-lead-generator-blank-template.csv`](public/templates/mypath-lead-generator-blank-template.csv).
Open it in Excel and save as **CSV UTF-8** before upload. Lead Generator imports
accept only permitted research, contact, qualification, owner, date, and notes
fields, and always create Active records at Lead Added. Forbidden columns are
stripped even if manually supplied. Filtered/full export remains Founder-only.
CSV is the only spreadsheet exchange in V1—there is no native `.xlsx` parsing or
live Excel synchronization.

## Backup and export guidance

CSV export is useful for reporting and portability, but it is not a full backup: activities, stage history, profiles, targets, settings, Auth users, and audit relationships are not included. Before migrations or bulk work, use the backup or PostgreSQL dump workflow supported by the Supabase project. Test restoration into a separate project periodically. See the [administrator guide](docs/ADMIN_GUIDE.md) for the recovery checklist.

Before a large import, apply migration 11, take a Supabase database backup, and
run [`supabase/verification/pre_import_readiness.sql`](supabase/verification/pre_import_readiness.sql)
in the SQL Editor. Resolve every `FAIL`; review `WARNING` rows for intentional
duplicates or disabled owners. The script is read-only. Import preview does not
write data, and confirmed rows are sent as one counted insert: a constraint or
policy failure rolls back the complete accepted batch.

## Cloudflare Pages readiness

`npm run build` creates `dist`. Cloudflare Pages natively treats a site with `index.html` and no top-level `404.html` as a single-page application, so React Router paths work after a browser refresh without a catch-all `_redirects` rule. No Worker or Pages Function is included. The exact Pages configuration and the distinction between Pages and Workers Static Assets are documented in [CLOUDFLARE_DEPLOYMENT.md](docs/CLOUDFLARE_DEPLOYMENT.md).

## Documentation

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture and security](docs/ARCHITECTURE.md)
- [Dashboard metrics and formulas](docs/METRICS.md)
- [User guide](docs/USER_GUIDE.md)
- [Administrator guide](docs/ADMIN_GUIDE.md)
- [Cloudflare Pages deployment](docs/CLOUDFLARE_DEPLOYMENT.md)
- [V1 test report](docs/TEST_REPORT.md)


test data
