# MyPath CRM User Guide

## Start here

Sign in with the email and password supplied by the CRM administrator. A newly
created or reset account can use that password immediately; no additional
password-change step is required. There is no public signup or email recovery.

The CRM is a shared workspace. Both users can see leads, activities, and pipeline history. Keep each record factual: leave a field blank when the information is unknown instead of estimating it.

## Lead Generator workflow

1. Research a qualified prospect and confirm that it fits MyPath's market.
2. Add the lead from **Leads**, including the company name and all facts available.
3. Set the lead source, customer segment, country, primary contact, and owner.
4. Use the qualification fields and move the lead to **Qualified** when the evidence supports it.
5. Add the next action and check the dashboard's **Missing information** list until the lead shows **Ready for Founder**.
6. Add dated activities and notes so the founder can understand the context.
7. Review **My tasks**, complete overdue/today work first, and add factual completion notes.
8. Review **Targets** and work toward weekly and monthly outcomes.

The dashboard and quick views distinguish leads you sourced (`created_by`) from
leads assigned to you (`owner_id`). Those are intentionally different metrics.

Duplicate warnings compare normalized company websites and contact email addresses. Review a warning before using **Save anyway**; do not create a second record merely because a spelling differs.

## Founder workflow

1. Review qualified leads and open the lead detail drawer for context.
2. Contact the lead, add the activity, and record the next action and date.
3. Move the card through the pipeline as real events occur.
4. Record discovery calls, demos, proposed value, proposals, and negotiation.
5. Enter a lost reason when an opportunity is lost. The existing stage is retained for drop-off reporting.
6. Close paid pilots and recurring contracts only when the corresponding outcome has occurred.
7. Review conversions, stage timing, stale leads, and funnel leakage on the founder dashboard.

## Leads and activities

- **Add lead** creates a shared record. Company name is required; email and URLs are validated when supplied.
- Phone is optional. Select a country calling code and enter the local number;
  the CRM stores valid numbers as E.164 and displays a clickable call action.
- Search covers company, contact, email, and website. Filters and sorting can be combined.
- Founder-only **Archive** removes a lead from normal active views without deleting its history. Restore reverses this action.
- Both roles can choose **Delete** on any lead. The dialog first archives the
  lead, then requires the exact company name before the protected database
  function permanently deletes it. Use **Restore** to cancel an archived deletion.
- Activity deletion is permanent and asks for confirmation. Add corrections as a new activity when preserving history matters.

## Pipeline and keyboard use

Every stage move opens a confirmation form. Add a concise description of what happened so the next reviewer has context. Turn on **Follow-up required** whenever another action is needed and choose the exact date. The Follow-up Required pipeline stage always requires this date. The CRM stores the description, follow-up status, actor, and exact movement time in Stage History; previous entries are never replaced.

Open a card by activating its company-name button. The drawer contains a keyboard-friendly stage control. The founder may also drag cards; focus a drag handle, press Space or Enter, use arrow keys to select a destination, and press Space or Enter again. Press Escape to cancel. A Lead Generator can move only Lead Added to Qualified.

Moving into proposal, negotiation, or a won stage requires a positive proposed value. Other missing information is shown as a warning and does not invent or block factual pipeline progress.

The top pipeline scrollbar stays available beneath the application header and
moves together with the scrollbar below the board. A green **Ready for Founder**
label requires website, country, segment, contact name/email, main pain point,
MyPath relevance, a 0–11 qualification score, and next action.

## Targets and dashboards

The founder creates weekly or monthly targets. A Lead Generator sees only personal target rows. Most target actuals come from stage-history events attributed to the user, so the person making the real change should perform the stage move.

Hover or focus metric help indicators for formulas. **Not enough data** means the database lacks a required denominator or complete history. See [METRICS.md](METRICS.md) for every calculation.

## Tasks

Tasks may be related to a lead or general. The Founder creates and assigns them.
Lead Generators see only assigned tasks and may change To do, In progress, and
Completed status, plus an optional completion note. Deadlines are date-only and
grouped into Overdue, Today, This week, and Later. The database records creation,
reassignment, and status history.

Deleting a task is Founder-only and permanently removes the task plus its event
history. Cancelled and completed work is hidden from the default active view;
use **Show closed history** when an audit trail is needed. Deleted tasks never
appear there, and task screens refresh when revisited. Permanently deleting an
archived lead also removes tasks linked to that lead; archiving alone does not.
In **Settings > Users & access**, Disable is reversible. Remove is
permanent: it deletes the member's assigned tasks and targets, reassigns their
owned leads to the Founder, blocks login, and anonymizes retained lead/activity/
stage authorship as “Former team member.”

## CSV import and export

CSV import is available to both roles; export is Founder-only.

1. Download the example template for guidance or the blank template for clean entry.
2. Keep the header row and save the file as UTF-8 CSV.
3. Choose or drag in a `.csv` file (maximum 5 MB and 5,000 rows per batch).
4. Review automatic column mapping; one source column cannot map to multiple fields.
5. Choose **Validate and preview**, resolve invalid owners or values, and review duplicate warnings.
6. Download the row report if changes are needed outside the CRM.
7. Confirm the import. All accepted rows are submitted in one database insert; if that insert fails, no accepted row is saved.

Lead Generators should use the Excel-ready template and save it as **CSV UTF-8**.
Only permitted research, qualification, and next-action fields are mapped; imported leads
always start Active at Lead Added. Invalid rows are skipped before confirmation.
Duplicate-warning rows are skipped unless included. A blank owner email assigns
the importer. Founders can export filtered data from **Leads** or all leads from
**Bulk import**.

CSV export is a working-data extract, not a complete database backup: it does not contain profiles, activities, stage history, targets, settings, or Auth accounts.
