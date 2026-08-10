# Phase 5.3 — Operational Workflows

Phase 5.3 converts the identity, organization, and role interfaces from visual prototypes into connected operational workflows.

## What changed

### Account provisioning

- The client and Platform Console use canonical `create_member` and `create_company` actions.
- The deployed `identity-provisioning` Edge Function accepts canonical and legacy action aliases.
- Company creation provisions the tenant, subscription, owner membership, account-security record, and temporary password.
- Member creation validates that the selected role belongs to the company and prevents assigning the protected Owner role through the normal member flow.
- Existing Optimum accounts are joined to the company without replacing their password.
- Errors are returned as JSON and displayed as readable messages instead of raw HTML.

### Reliable role saves

- Role and template forms no longer disable permission inputs before reading them.
- `save_company_role_definition` atomically saves the role and its permission set.
- `platform_save_role_template_definition` does the same for global templates.
- Empty permission sets are rejected by default.
- The response confirms the persisted permission count and keys.
- Every save writes an audit event with the confirmed permission list.

### Company identity and settings

- Identity asset storage now has the internal helper execution grant required by RLS.
- `save_company_workspace_settings` saves full company data and branding in one workflow.
- Saved branding is applied immediately to application colors, theme, sidebar, density, radius, name, and logo.
- Company settings include legal, tax, billing, technical, address, locale, timezone, and contact data.
- Subscription and usage are presented as an operational view rather than editable branding fields.

### Activity centers

- Company activity is loaded through `company_activity_feed` with actor details.
- Platform audit has KPIs, free-text search, company/action/date filters, detail inspection, and CSV export.
- Metadata is retained for troubleshooting and accountability.

### People workspace

- Member creation presents role cards with permission counts and highlights.
- The professional employee profile summary appears after the data sections instead of competing with the form.
- Photo, employment data, access period, permission overrides, and protected compensation data remain part of one controlled provisioning workflow.

## Database and backend

Migration:

`supabase/migrations/20260806114000_phase5_3_workflow_reliability.sql`

Edge Function:

`supabase/functions/identity-provisioning`

The migration and Edge Function were applied/deployed to the connected Optimum Supabase project during development.

## Current release status

This is a pre-publication operational review build. It is intended for workflow testing and further product refinement before production hosting.
