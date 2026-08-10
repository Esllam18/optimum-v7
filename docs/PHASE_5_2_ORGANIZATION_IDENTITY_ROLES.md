# Optimum Phase 5.2 — Organization Identity, Role Studio & People Directory

## Scope

Phase 5.2 builds on the private account-provisioning flow from Phase 5.1 and adds the organization controls required before production rollout.

## Company identity

Each company now owns a private branding record with:

- Company logo stored in the private `identity-assets` bucket.
- Application display name and tagline.
- Primary, accent, and neutral colors.
- Default light, dark, or system theme.
- Sidebar style, corner style, interface density, and logo shape.

Users with `branding.manage` can update the identity from the client application. Platform administrators can also manage it from the separate Platform Console.

## People directory and compensation

Member accounts now support:

- Profile photo.
- Full contact and employment data.
- Employee code, job title, department, manager, and access period.
- Base salary, currency, pay frequency, effective date, allowances, and bonus target.

Compensation is stored separately from the public member profile. It is protected by `compensation.view` and `compensation.manage`; ordinary team viewers never receive salary rows.

## Smart role studio

Company owners and authorized administrators can:

- Create a custom role from scratch.
- Start from a recommended template.
- Edit Arabic and English names and descriptions.
- Give the role a visual color and icon.
- Enable a complete permission module or individual actions.
- See how many users and permissions use each role.
- Delete a custom role after reassigning its members.

The protected Owner role cannot be deleted or weakened accidentally.

## Platform role library

The separate Platform Console now has a global Role Library. Platform administrators can create, update, recommend, disable, or delete reusable role templates. Templates are starting points only: each company remains free to customize its own roles and permissions.

Included starter templates:

- Project Manager
- Fiber Engineer
- Technical Reviewer
- HR Manager
- Read Only

## Security model

- Logos and member photos are private and accessed with short-lived signed URLs.
- Storage paths begin with the company ID and are checked by RLS.
- Salary data is isolated in `member_compensation` and protected independently.
- Role-template management is restricted to active platform administrators.
- Company role management checks both tenant scope and explicit permissions.
- Sensitive operations write audit events.
- No service-role key is shipped in either browser application.

## Compatibility

The Phase 4.17 CAD editor and all Phase 5.1 first-login behavior remain unchanged. Phase 5.2 is an additive organization and UI upgrade.

## Verification completed

- All automated regression tests from CAD 4.11 through organization controls 5.2 pass.
- Both portable web processes were started and checked on ports 4173 and 4174.
- Supabase advisors were run after the final migrations.
- The Phase 5.2 unindexed foreign key, repeated auth initialization, and overlapping SELECT-policy warnings were corrected in `phase5_2_policy_performance_hardening`.
- Remaining performance notices are unused-index informational notices expected on a low-data pre-production database.
- The security advisor still reports intentional authenticated `SECURITY DEFINER` workflow RPCs; the new Phase 5.2 functions perform explicit tenant/permission checks, and none of the sensitive functions is executable by `anon`.
