# Optimum V7 — Premium Operating Surface & Security Review

Date: 2026-08-10
Checkpoint target: 08

## Objective
Move V7 from a technically strong reconstruction into a coherent premium engineering-operations product without reintroducing the density, flat hierarchy, broad loading, or hidden-scope problems found in V6.9.

The pass deliberately avoids decorative redesign for its own sake. Each changed surface now prioritizes the next operational decision.

## Premium UI pass completed

### Navigation shell
The flat navigation list was replaced by permission-aware groups:
- Workspace — Overview, Work, Projects
- Delivery — Documents, Engineering, Delivery
- People & control — People, Control

This makes the information architecture scalable without reintroducing the long V6.9 sidebar.

### Dashboard
Dashboard is now an execution surface instead of four equally weighted KPI cards.

New hierarchy:
- Execution Pulse hero
- overdue / blocked / due-today actions deep-linking into Work
- workspace capacity for storage, projects and members
- open-work total
- priority work
- recent projects.

No additional API fan-out was added.

### Work
Work now exposes an `EXECUTION FOCUS` surface before the table:
- overdue
- blocked
- due today
- open work.

Status and due-date filters are visible first-class controls, including Today / Overdue / This week. Context-scoped Work still suppresses company-wide metrics to avoid mixing global counts with project/site/document context.

### Projects + 360
Projects now reads as a portfolio workspace:
- plan/project capacity
- sticky search/filter surface
- stronger progress hierarchy
- client, target date and last update
- explicit `Open 360` action.

Project/Site/Cabinet 360 uses a dedicated entity hero rather than a generic page header and retains canonical context actions into CDE, Work, Engineering and Delivery.

### CDE / Documents
CDE now makes the document context explicit:
- active CDE context strip
- project/site/folder breadcrumb
- folder/document metrics
- hierarchical folder depth
- document list columns for version, update and control status
- clearer search/empty states.

The page remains 50-row paged and uses server-side document search; no broad document preload was reintroduced.

### People
People now opens with Team Health rather than four equal cards. The member directory has explicit Member / Role / Scope / Status columns while keeping the server-side 50-row directory contract.

The secure native invitation flow remains unchanged: no temporary password generation or delivery.

### Delivery
Delivery now has a Submission Pipeline surface and visible server-side search/status filters. `delivery_directory_query` receives `p_query` and `p_status`; filtering is not performed against a browser-loaded subset.

The package table exposes package identity, version mode, last update and status. Canonical CDE linking / frozen-version semantics remain unchanged.

### Governance / Control
Organization health is now the primary governance hero with:
- readiness score
- progress
- active members
- roles
- attention gaps
- projects.

Readiness steps and operational issues remain actionable. Role cards distinguish protected vs customizable roles and expose the role slug for audit clarity.

### CAD
The existing premium V7 CAD pass remains intact:
- full-screen engineering workspace
- collapsible palette/inspector
- fit-to-view button and `F`
- `Ctrl+S`, `F`, `Del`, `Esc` shortcut status
- live validation/takeoff
- DXF/SVG
- autosave/local recovery.

The proven V6.9 geometry/takeoff/export core remains preserved.

## Responsive behavior
The new operating surfaces include explicit adaptations around 1180, 900 and 680 px rather than adding a new cascade of unrelated breakpoints. Dense table headers collapse appropriately on tablet/mobile while lists remain horizontally safe where engineering data cannot be compressed without losing meaning.

## Security allowlist review
Live Production inventory:
- 162 public `SECURITY DEFINER` functions
- 153 authenticated-executable
- 0 anon-executable.

Authorization-signal scan:
- 151 / 153 contain a direct auth/permission/resource/platform/service signal.
- 2 / 153 required manual review.

Manual exceptions:
- `resolve_engineering_review_mark` is an authorized wrapper over `update_engineering_review_mark`, whose live target requires `drawings.review`.
- `invitation_preview` is an intentional token-scoped read and remains unavailable to `anon`.

Detailed rationale: `docs/V7_SECURITY_DEFINER_ALLOWLIST.md`.

Leaked-password protection remains disabled; no connected action exists to mutate that Auth setting, so no false completion is claimed.

## Validation
- `npm run test:v7` — PASS.
- JS/JSX TypeScript parser/no-emit pass — PASS.
- `npm run test:release` — PASS after the complete Premium UI pass (V6.9 regression + all V7 contracts).
- New `tests/v7-premium-ui-7.0.mjs` is now part of `test:v7` and protects the navigation/dashboard/work/projects/360/CDE/people/delivery/governance operating-surface contracts.

## Production build gate
`npm run build` still stops before application compilation because the execution environment has no working Next binary:

`sh: 1: next: not found`

A clean install was attempted from the existing lockfile using `npm ci --ignore-scripts`. It failed at the environment's internal package registry:

`404 Not Found ... tslib-2.8.1.tgz`

An explicit public-registry probe (`npm view ... --registry=https://registry.npmjs.org`) also timed out in this execution environment, so bypassing the internal registry is not available here. Therefore no production build success is claimed. The gate is dependency/registry restoration followed by a real `next build`, then browser visual QA.

## Production gates still open
1. Restore a working Next/React dependency environment and run `next build`.
2. Browser/pixel QA for V7 dark/light + RTL/LTR + desktop/tablet/mobile.
3. First real V7 CAD save to migrate legacy inline frame-logo data into private asset references, then remeasure persisted payload and save latency.
4. Enable and verify Auth leaked-password protection.
5. Verify Backup/PITR policy and complete a restore drill into non-production.
6. Define production alert thresholds for API/Auth/Storage/Postgres errors/latency.
