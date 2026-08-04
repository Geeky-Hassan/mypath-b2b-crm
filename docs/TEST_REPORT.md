# MyPath CRM V1 Test Report

Date: 2026-08-04

## Release result

The application is ready for Supabase-backed staging. Static checks,
unit/component/contract tests, and the production build pass. Production release
remains conditional on applying all migrations through
`202608040011_task_assignment_consistency.sql`, deploying `team-admin`, and
completing live Founder/active/disabled/removal checks from
[ADMIN_GUIDE.md](ADMIN_GUIDE.md).

## Automated results

| Check              | Result | Evidence                                                                                                                               |
| ------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency install | Pass   | `npm install` completed with lockfile present                                                                                          |
| ESLint             | Pass   | Zero lint errors and zero allowed warnings                                                                                             |
| TypeScript         | Pass   | Project references completed without emit or errors                                                                                    |
| Vitest             | Pass   | 20 test files, 102 tests passed                                                                                                        |
| Prettier           | Pass   | All checked files match formatting rules                                                                                               |
| Production build   | Pass   | Vite produced `dist/index.html` and static assets                                                                                      |
| SPA fallback       | Pass   | Build contains `dist/index.html` and relies on Cloudflare Pages' native SPA fallback; no conflicting catch-all `_redirects` is emitted |
| Route HTTP smoke   | Pass   | Every application route returned the SPA shell with 200; logo and all four role-aware templates returned 200                           |
| Supabase db lint   | Pass   | Linked `extensions`, `private`, and `public` schemas returned no errors                                                                |

The test runtime in this workspace is Node 25.2.1 and emits a Node-level `--localstorage-file` warning while starting jsdom. It does not originate in application code, no test fails, and the project pins the supported build runtime to Node 22.16.0. No application warning was suppressed.

## Test coverage

- Lead required fields, email/URL validation, date validation, lost reason, and proposed-value rules.
- Optional phone handling, calling-country parsing, E.164 normalization, validation, and display formatting.
- Website/email duplicate normalization and record exclusion during edits.
- PapaParse quoting, header aliases, duplicate heading/mapping detection,
  role-aware blank/example template generation, file guardrails, downloadable
  reports, UTF-8 warnings, and spreadsheet-formula escaping.
- Atomic import payload normalization, one-statement persistence, empty imports, and failed-batch reporting.
- Lead Generator CSV field restriction, protected-column stripping, and Excel-ready template generation.
- Every detailed-stage-to-funnel mapping, funnel counts, conversion denominators, lead-to-paid-pilot conversion, stage timing, sales-cycle timing, target progress, breakdowns, and missing-data behavior.
- Founder and Lead Generator permission helpers, including archive/deal controls and the single allowed Lead Generator stage transition.
- Protected-route return paths and founder-route denial/allow behavior.
- Direct Founder-issued password access and account password policy/generation.
- Login form validation, credential submission, and safe authentication errors.
- Lead form required-field and successful minimal-create component flows.
- Founder member-removal component flow, including exact-email confirmation and
  the sanitized Edge Function request.
- Static RLS migration contract for authenticated lead access, financial-column isolation, database-enforced Lead Generator boundaries, founder/archive deletion, owner-scoped target reads, founder-only target writes, anonymous revocation, and trigger-owned stage history.
- Disabled-account data blocking, assigned-task isolation, Founder task administration, and trigger-owned task history contracts.
- Atomic Founder task deletion, explicit task-event cleanup, task-to-lead
  cascade, focus/visible-tab refresh, zero-row rejection, and surfaced database
  failures.
- Team attribution metrics for lead creator, lead owner, activity actor, stage actor, task assignee, and target progress.
- Edge Function contract checks for caller revalidation, Founder-only account
  actions, Lead Generator-only targets, account quarantine/removal, sanitized
  errors, and frontend service-key exclusion.
- Audit-safe member-removal contract: assigned tasks and targets are deleted,
  lead ownership is reassigned, personal profile fields are anonymized, and
  lead/activity/stage provenance is retained.
- Active-assignee database contracts prevent new leads, targets, or tasks from
  being assigned to Disabled or Removed accounts.
- Rerunnable sample-data contract for two stable leads with contextual stage
  history and dated follow-ups.
- Archive and permanent-delete persistence verifies exactly one affected row so
  RLS-denied zero-row mutations cannot be reported as successful.
- Defensive date and currency formatting for invalid stored values and local date-input handling.
- Exact weekly/monthly target-period validation and stale asynchronous response suppression.

## Security review result

- No service-role key or privileged Supabase credential exists in frontend source or environment examples.
- Browser configuration accepts only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Session restoration, auth-state subscription cleanup, stale profile-request protection, logout error handling, and safe post-login local redirects are implemented.
- Founder-only routes have direct route guards. Navigation hiding is not treated as authorization.
- RLS policies are scoped to `authenticated`; anonymous table and sequence grants are revoked in the hardening migration.
- Every active CRM policy also checks Active account state; disabled users receive no CRM rows even while an old JWT exists.
- Lead Generator permanent deletion is blocked by founder RLS and archived-state requirements.
- Lead Generator sales/lifecycle/archive fields and later pipeline transitions are blocked by a database trigger; proposed value and expected close date are hidden by the authorised read projection.
- Target writes and settings changes require founder status; target reads remain owner-scoped for Lead Generators.
- Lead/activity provenance is immutable, settings update actors are database-stamped, and stage history is trigger-owned.
- Accepted CSV imports are one multi-row database insert, so a database failure rolls back the accepted batch.
- The import client requests an exact inserted-row count and rejects a response
  that does not confirm the complete accepted batch.
- Lead Generators can only update assigned task status/completion note; Founder assignment controls are protected by RLS and a trigger.
- Auth Admin methods and the service-role key exist only in the Supabase Edge Function. Cloudflare and Vite still require only browser-safe values.

## Dependency advisory

`npm audit --omit=dev` currently reports two high-severity package entries (`react-router` and its direct wrapper `react-router-dom`) for the same React Router RSC-mode CSRF advisory: <https://github.com/advisories/GHSA-qwww-vcr4-c8h2>. The application uses a static `BrowserRouter` SPA and no React Server Components, server actions, route actions, SSR server, Worker, or Pages Function, so the vulnerable execution path is absent. The project pins React Router 7.18.2; npm's suggested forced remediation is a breaking downgrade to 7.11.0 and was not applied. Upgrade promptly when a patched stable release becomes available.

## Manual checks still required

- Apply all 11 migrations to a non-production Supabase project and deploy `team-admin`.
- Use real Founder and Lead Generator sessions to execute every RLS check in the administrator guide.
- Confirm valid/invalid login, refresh restoration, and logout against Supabase Auth.
- Verify direct-login account creation, password reset, disable, reactivate, and
  permanent removal with Founder and Lead Generator sessions.
- Execute direct task requests as a Lead Generator to prove create/reassign/delete denials.
- Confirm stage moves create exactly one history record with the correct actor.
- Force one CSV constraint failure in staging and confirm the accepted batch remains absent.
- Run `supabase/verification/pre_import_readiness.sql`; resolve every FAIL and
  review every duplicate/disabled-owner WARNING before the production import.
- Perform browser/assistive-technology smoke testing with production-like data.
- After a later Cloudflare preview deployment, refresh each route and repeat the authorization checks. No deployment was performed in this review.
