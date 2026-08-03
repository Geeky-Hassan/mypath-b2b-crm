# MyPath CRM Architecture

## Application shape

The CRM remains a client-rendered Vite React SPA. React Router owns public,
authenticated and founder-only boundaries. Supabase Auth
restores email/password sessions, while `src/services/crm.ts` centralizes data
access. Privileged Auth administration runs only in the `team-admin` Supabase
Edge Function.

The interface preserves the navy-and-teal component system. dnd-kit supplies pointer and keyboard drag sensors without changing stage order in the browser. Recharts renders three focused founder charts; tables and ranked lists carry the denser metrics so the dashboard remains readable.

## Database model

| Table             | Responsibility                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `profiles`        | Auth-linked identity and protected CRM role                                                                |
| `leads`           | Company, contact, qualification, current detailed stage, lifecycle, deal, follow-up, notes, and provenance |
| `lead_activities` | Dated interaction timeline with creator                                                                    |
| `stage_history`   | Trigger-owned initial stage and every later pipeline move                                                  |
| `targets`         | Supported weekly/monthly activity targets per user                                                         |
| `sales_costs`     | Founder-entered cost for an exact date period, used only for CAC                                           |
| `crm_settings`    | Singleton organization name and currency                                                                   |
| `crm_tasks`       | Founder-assigned, lead-linked or general operational work                                                  |
| `task_events`     | Trigger-owned creation, reassignment, status, and completion history                                       |

Migration `202608030003_sales_funnel_pipeline.sql` replaces the old seven-value stage enum with the 14 detailed stages. Legacy New, Qualified, Discovery, Proposal, Negotiation, and Won values map to the closest factual new stage. Legacy Lost becomes lifecycle-only and retains the most recent pre-loss stage where history permits. The migration does not infer recurring-contract wins.

The migration adds database checks requiring a lost reason for Lost lifecycle writes and positive proposed value for proposal, negotiation, and won stages. Both checks are `NOT VALID`: they protect future writes without fabricating values for legacy rows. Compatible target names are migrated; unsupported legacy won-value targets remain stored but hidden from the current supported target query.

Migration `202608030004_v1_hardening.sql` narrows target writes to founders, makes activity provenance immutable, stamps the authenticated settings editor, revokes anonymous table and sequence grants, and removes direct execute permission from internal trigger helpers.

Migration `202608030005_role_boundaries_and_quality.sql` enforces Lead Generator field/stage restrictions in a database trigger, adds exact weekly/monthly target constraints, and introduces the authorised `crm_leads` read projection. The projection retains shared CRM context while returning proposed value and expected close date only to the founder; direct authenticated reads of those two base-table columns are revoked.

Migration `202608030006_reconcile_pipeline_stage_values.sql` protects databases where obsolete enum labels were appended during an attempted migration rerun. It refuses to invent a mapping for stored legacy values and adds table constraints so only the 14 supported operational stages can be written. PostgreSQL retains the unused enum labels in metadata, but they are not valid CRM data values.

Migration `202608030007_stage_context_and_follow_up.sql` adds a description, follow-up flag, and exact follow-up date to every stage-history entry. The transactional `move_lead_with_context` function passes that context to the trigger while existing RLS and role-boundary checks still govern the lead update. Direct stage changes without a description are rejected, preserving complete dated provenance.

Migration `202608030008_team_operations.sql` adds optional E.164 phone storage,
profile work details and account state, tasks, and task history. Its
`private.can_use_crm()` helper makes an Active account a precondition for every
CRM data policy. A disabled session receives no CRM rows.

Migration `202608040009_direct_login_account_access.sql` clears legacy forced
password-onboarding flags and aligns database access with Founder-managed direct
login credentials. The Edge Function confirms email on create, password reset,
and reactivation, while RLS continues to make account status the immediate data
access boundary.

## Pipeline mutation and provenance

The board loads the shared lead graph once, then filters locally. On drop, the UI checks explicit stage requirements and displays non-blocking completeness warnings. Every move requires a stage description and may attach a dated follow-up; entering Follow-up Required automatically requires the date. A single transactional function can set proposed value and stage together. PostgreSQL triggers synchronize Won lifecycle and append `stage_history` with the authenticated actor, database timestamp, description, and follow-up data. Clients have no direct stage-history write grant.

Marking Lost updates lifecycle and lost reason but leaves the detailed stage unchanged, making drop-off reporting possible. Moving a previously Lost or Won lead to a non-won stage returns lifecycle to Active and clears the old lost reason.

## Metrics

Pure functions in `src/lib/metrics.ts` calculate stage mapping, funnel counts, breakdowns, conversion rates, sales-cycle samples, time-in-stage samples, target actuals, lost reasons, and data-quality warnings. Dashboard and Analytics components only format those results. This split provides deterministic tests and avoids hidden chart-specific calculations. `/analytics` loads the same `crm_leads` graph as the dashboard, then applies view filters locally so every chart, stage card, and table remains consistent with the pipeline.

Stage-to-stage conversions require actual history entry into the denominator stage. Sales cycle requires both Lead Added and a won history event. Time in stage uses consecutive history timestamps; the current interval is extended through now only for open Active or Nurture leads. Null samples render “Not enough data.”

## Authorization

Anonymous access remains revoked. Active users can read shared
profiles, non-financial lead context, activities, and history. Lead Generators
see only assigned tasks and can change only status/completion note; the Founder
owns task creation, assignment, cancellation, editing, and deletion. Existing
lead, target, financial, archive, and stage boundaries remain database-enforced.
Stage and task histories are readable but trigger-owned.

The browser calls `team-admin` with its current JWT. The function revalidates the
caller, requires an Active Founder for administrative actions, targets only Lead
Generator accounts, and uses a server-only service-role client. It never returns
or logs passwords. Its service key is not a Vite or Cloudflare variable.

CSV preview and validation happen in the browser, but accepted imports are persisted with one multi-row PostgREST insert. PostgreSQL executes that statement transactionally: if any accepted row fails a policy or constraint, none of the accepted rows are committed.

## Verification surface

Vitest covers the shared lead schema, CSV parsing, duplicate normalization, atomic import persistence, role helpers, route guards, authentication errors, important form behavior, display-format safety, all stage-to-funnel mappings, funnel counts, conversion denominator behavior, sales-cycle duration, time-in-stage intervals, and target progress. ESLint, TypeScript, Prettier, and the Vite production build remain required before handoff.
