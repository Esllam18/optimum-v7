# Optimum V7 — People, Dashboard, Delivery, Security & Operations Gate (Round 05)

## Scope completed

This round focused on enterprise-scale People/Delivery reads, Dashboard hot paths, Organization governance UX, CAD interaction polish, live log review, and the SECURITY DEFINER/Auth/backup/monitoring launch gates.

## People / Team

### Before
`PeoplePage` loaded up to 200 `company_memberships`, then loaded roles, then issued a second profile fan-out and filtered in the browser. The Invite action redirected to the legacy Team page.

### Now
- Added `public.member_directory_query(...)`.
- Server-side search, role filter, status filter, page limit/offset and accurate company counts.
- Maximum API page size: 100; V7 UI uses 50.
- Native V7 Invite sheet now calls `create_company_invitation`.
- Owner role is not assignable through the sheet.
- No temporary password is generated or emailed by V7.
- The administrator receives a time-limited activation URL (`?invite=`) to share through a trusted channel.
- Existing `member_access_snapshot` remains the Member 360 deep read.

### Live smoke
- Current owner directory total: 3.
- Search for the existing Nader member returned 1.
- Requested page limit 2 returned limit 2.
- An authenticated UUID with no company access was denied.
- A temporary invitation was created as `pending` inside a transaction, then rolled back; persisted smoke invitations = 0.

## Dashboard performance

The legacy `work_dashboard_metrics` repeated `can_view_task()` for every aggregate predicate and every task row.

### Synthetic rollback profile: +300 tasks
- Before: average **2625.08 ms**.
- After V7 set-wise fast path: average **1.42 ms** (0.90–2.96 ms).
- Scoped-manager verification: dashboard visible/open counts matched the scoped Work query exactly (1 vs 1).

The optimization only bypasses row-by-row visibility evaluation when the caller has company-wide, unscoped Work visibility. Scoped users still use the full task-visibility contract.

## Organization / Control

- `organization_health_snapshot` measured about **3.55 ms** in the load-profile pass; no backend rewrite was justified.
- `workspace_intelligence_snapshot` measured about **11.05 ms**; no rewrite was justified.
- V7 Control is no longer a roles placeholder. It now renders:
  - organization health score;
  - active members / roles / attention count;
  - setup readiness steps;
  - actionable governance issues;
  - role library.

Current organization health returned 74% with three operational gaps: company identity incomplete, one member without a direct manager, and organization structure not started.

## Delivery / Claims scale

### Before
Delivery loaded at most 80 packages and 120 cabinets directly. Once the tenant exceeded those limits, dashboard counts would be incomplete even if the query itself remained fast.

### Now
Added `public.delivery_directory_query(...)`:
- tenant/resource scope enforcement;
- project/site context;
- server-side status/search hooks;
- 50-row V7 pages (100 max RPC limit);
- accurate package status totals independent of current page;
- accurate cabinet count independent of current page.

### Synthetic rollback profile: +500 claim packages
- Total visible packages: 501 including the real package.
- Returned page rows: 50.
- Average directory query: **7.55 ms** (5.11–16.71 ms).
- Persisted synthetic packages after rollback: 0.

## CAD premium interaction pass

The V7 CAD workspace already has isolated full-screen shell, collapsible component palette, contextual inspector, live validation/takeoff, DXF/SVG, idle autosave and local recovery.

This round added:
- real Fit-to-view action;
- `F` keyboard shortcut for fit;
- visible keyboard hints (`Ctrl+S`, `F`, `Del`, `Esc`);
- responsive hiding of shortcut chrome on small screens.

The engineering algorithms remain the proven V6.9 core; this is a UX layer change, not a mathematics rewrite.

## SECURITY DEFINER review status

Current `public` schema inventory:
- SECURITY DEFINER functions: **162**.
- Executable by `authenticated`: **153**.
- Executable by `anon`: **0**.

This is not treated as “153 vulnerabilities.” Optimum intentionally uses authenticated SECURITY DEFINER RPCs as its controlled service/API surface. The launch requirement is therefore a function-by-function allowlist and authorization review, not mass revocation.

Reviewed in this round:
- `create_company_invitation`: intentional authenticated command; validates auth, `members.invite`, tenant role ownership, role delegation, owner exclusion, email, duplicate membership and expiry, and audits creation.
- Platform company/template/entitlement RPCs inspected: platform-admin gate is present.
- `work_scheduler_tick`: authenticated EXECUTE is already false; service-role EXECUTE is true.
- Work automation save/test RPCs have Work management authorization.
- `cleanup_stale_uploads`: authenticated exposure remains intentionally backward-compatible because V6.9 invokes it at boot. It only cleans caller-owned abandoned reservations or company reservations when `files.manage` is held, and refuses to abort when a Storage object exists. Do not revoke until the legacy boot path is retired.
- New V7 People/Dashboard/Delivery functions revoke PUBLIC/anon and grant only authenticated, with internal authorization.

## Auth gate

Supabase Security Advisor still reports leaked-password protection disabled. The available connected tooling exposes documentation/search but no supported Auth-setting mutation action, so this round does **not** claim it has been enabled. It remains a production launch gate to enable in Supabase Auth settings and verify in staging.

## Monitoring / live log review

The connected Supabase tools can read API/Auth/Storage logs for the last 24 hours.

Observed:
- Legacy V6.9 repeatedly polls `work_runtime_revision` and `organization_runtime_revision` around every five seconds in older sessions. V7 does not use that polling model; V7 boot loads one cached `workspace_runtime_policy` and route data on demand.
- Historical `save_engineering_draft` 500s are visible before/around the CAD save work; later calls include successful 200s. V7 still needs a real browser CAD save after legacy logo migration to finish this gate.
- Historical signed logo/avatar URL GETs returned 400. More recent Storage signing/GET events include 200s. V7's `BrandAvatar` uses signed-URL caching and negative/fallback handling rather than repeatedly displaying a broken image.
- Auth refresh-token calls are succeeding with 200 in the sampled logs; historical transient 401 RPC calls around refresh are visible and are one reason V7 serializes refresh through a shared refresh promise.

## Backup / restore gate

No backup-management action is exposed by the connected Supabase toolset in this session. Therefore a backup or point-in-time restore has **not** been triggered or verified here.

Production launch still requires:
1. verify the project backup/PITR policy in Supabase;
2. record retention/RPO/RTO expectations;
3. perform a restore drill into a non-production environment;
4. verify tenant data, migrations, Storage object references and Auth linkage after restore.

Do not mark backup/restore PASS until a restore drill is completed.

## Production migrations applied in this round
- `v7_people_directory_security_contract`
- `v7_dashboard_metrics_performance`
- `v7_delivery_directory`

These are in addition to the earlier V7 Work, Project 360, Engineering draft and Site 360 migrations.

## Regression status

`npm run test:release` — **PASS** after all changes in this round.

The full legacy 6.9 static/contract suite and all V7 contracts pass together, including new tests for:
- People/security;
- Dashboard performance contract;
- Delivery directory;
- CAD premium UX;
- Organization control.

## Remaining gates

1. Restore Next/React dependencies and run actual `next build`.
2. Browser visual/responsive QA of V7, especially CAD.
3. Perform first real V7 CAD save to migrate Base64 logos to Storage assets, then remeasure.
4. Finish explicit SECURITY DEFINER allowlist review for the remaining authenticated RPC surface.
5. Enable/test leaked-password protection.
6. Execute backup/restore drill.
7. Add operational alert thresholds around API 5xx, Auth failures, slow DB/RPCs and Storage failures.
