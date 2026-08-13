# MyPath CRM Product Specification

## Purpose

MyPath CRM is a focused internal workspace for founder Noor Ul Hassan and authorised Lead Generators. It combines prospect research, one primary contact, qualification, activity history, an operational sales funnel, proposed value, and weekly or monthly targets.

## Users and permissions

Founder sees the complete sales dashboard, deal values, sales-cost entry, targets,
CSV export, team operations, and Lead Generator administration. Lead Generators
create/enrich/import leads, maintain next actions, use safeguarded permanent
deletion, record activities, complete
assigned tasks, may move Lead Added to Qualified, and see a personalized My focus
dashboard. Both roles read shared non-financial lead context; database policies
enforce later sales, lifecycle, archive, financial, task, and account boundaries.

## Funnel and detailed pipeline

Lifecycle remains independent: Active, Nurture, Won, Lost, or Archived.

| Macro funnel         | Detailed stages                                                                 |
| -------------------- | ------------------------------------------------------------------------------- |
| Awareness            | Lead Added → Qualified → Contacted                                              |
| Interest             | Replied → Initial Discussion → Follow-up Required                               |
| Consideration        | Discovery Call Booked → Discovery Call Completed → Demo Booked → Demo Completed |
| Decision             | Paid-Pilot Proposal Sent → Negotiation                                          |
| Action and Retention | Paid Pilot Won → Recurring Contract Won                                         |

The board uses pointer and keyboard drag sensors. Synchronized sticky-top and bottom horizontal scrollbars provide access across long columns. Each column shows its lead count and proposed-value total. Filters cover owner, segment, source, country, and date-added range. A card opens a lead drawer with current facts, readiness, notes, recent activities, and stage history.

Every successful stage change updates `leads.current_pipeline_stage` and is appended to `stage_history` by a database trigger with the exact timestamp, actor, required description, and optional dated follow-up. Entering the Follow-up Required stage requires an exact follow-up date, while any other stage may also carry one. Marking a lead Lost does not overwrite its pipeline stage, preserving the drop-off location. A positive proposed value is required before proposal, negotiation, or either won stage. Missing contact or market information produces a warning rather than a block.

## Dashboards

The Founder dashboard provides lifetime funnel volumes, active value, current distributions, conversions, sales-cycle timing, time in stage, lost reasons, drop-off stages, and four operational attention queues. CAC appears only for the current calendar month after the founder records sales cost and at least one customer has a recorded won transition in that period.

The Lead Generator dashboard uses the current Monday-to-Sunday week for weekly
progress and also shows matching monthly targets. It explicitly separates leads
created by the user from leads assigned to the user. It includes job title,
responsibilities, data-quality warnings, task urgency, and recent factual activity.

All charts and figures are derived from database rows. Incomplete denominators and incomplete histories display “Not enough data.” Formula details are exposed through help tooltips and documented in `docs/METRICS.md`.

## Journey analytics

The shared Analytics route connects the complete 14-stage lead journey to the same leads and `stage_history` records used by the dashboard and drag-and-drop pipeline. It provides owner, segment, source, country, and date filters; macro-funnel charts; lead and stage-movement trends; source and lifecycle charts; a complete stage-performance table; recent stage movements; and overdue next actions. Founder-only proposed values remain hidden from Lead Generators.

## Targets

Targets can be weekly or monthly and support:

- Leads added
- Qualified leads
- Leads contacted
- Replies
- Discovery calls booked
- Demos booked
- Proposals sent
- Paid pilots won

Leads added counts creator provenance. Every stage-based target counts distinct stage-history events attributed to the target user inside the inclusive date range.

## Other CRM workflows

The Leads page retains add/edit forms, optional international phone numbers,
search, role-aware quick views, filters, sorting, pagination, duplicate warnings,
archive/restore, safeguarded shared deletion, Ready for Founder status, activities, notes, and stage history.

Tasks may be lead-linked or general. The Founder creates, edits, assigns, cancels,
and deletes them. Lead Generators see only assigned tasks and update status plus an
optional completion note. Closed history is hidden by default; deleted tasks are
removed for every assignee, and permanently deleting a linked lead also removes
its tasks. The Team view reports factual creator, owner, activity
actor, stage actor, task, and target metrics without rankings.

Both roles can import mapped/validated CSV using role-aware blank/example
templates, drag-and-drop, a row report, and explicit confirmation. Lead Generator
imports are restricted to research, qualification, and next-action fields and forced to
Active at Lead Added; only the Founder can export. Founder exports are asynchronous ZIP
packages containing Excel-ready lead, activity, and stage-history CSV files. Leads-page
exports support current filters plus exact-current-stage or reached-milestone matching;
Bulk Import opens the same stage/milestone chooser across all CRM leads before any
download starts. CSV remains the spreadsheet data format inside the package.

The Founder creates, resets, disables, reactivates, and permanently removes Lead Generator accounts
through a secured Supabase Edge Function. Founder-set passwords are immediately
usable and account creation/reset confirms the email server-side. Users are
disabled for reversible pauses. Permanent removal deletes assigned tasks and
targets, reassigns owned leads to the Founder, blocks the Auth identity, and
retains only an anonymized profile tombstone when audit ownership must be
preserved.

## Out of scope

Public signup, password recovery, email sending, automated reminders, mobile apps, multi-contact accounts, paid APIs, realtime synchronization, currency conversion, deployment, Cloudflare Workers or Pages Functions, and live Excel synchronization remain out of scope. Static Cloudflare Pages configuration is documented for a later release but has not been deployed.
