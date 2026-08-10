# Optimum V7 — Release Gates: Native Runtime & Observability

Date: 2026-08-10  
Production Supabase project: `wzcaquxuvqfbstpxujsj`

## Executive result
This pass closes three architectural/release gaps without claiming the still-blocked Next production runtime:

1. V7 Engineering no longer loads or routes into the legacy Engineering UI runtime.
2. Mandatory first-login security is now a native V7 surface using the existing trusted backend contract.
3. V7 now has persistent, tenant-safe technical diagnostics with a write-only RLS ingestion path.

## 1. Native CAD runtime separation
Created `src/v7/lib/cadCore.js` as the V7 pure engineering core. `CadWorkspace.js` imports this module rather than `assets/engineering.js`.

A dedicated parity test compares V7 vs the proven legacy core for:
- snapshot normalization,
- takeoff,
- validation,
- compatible DXF export,
- SVG export.

The deterministic parity fixture passes. V7 Engineering contains no `/#/engineering` fallback and no direct import from `assets/engineering.js`.

This is an extraction with parity protection, not a speculative rewrite of CAD math.

## 2. Native first-login security
Created `src/v7/components/FirstLoginSecurity.js`.

The surface:
- runs entirely inside `/v7`,
- confirms full name/contact/timezone,
- enforces the same strong-password categories used by the backend,
- requires terms acceptance,
- invokes `identity-provisioning-v55` with action `complete_first_login`,
- does not bypass the trusted backend with a direct browser password update,
- handles the backend's `session_preserved` outcome.

The first-login UI passes Chromium desktop/mobile, dark/light and RTL/LTR representative checks with zero horizontal overflow.

## 3. Client telemetry architecture
Created:
- `src/v7/lib/telemetry.js`
- `src/v7/components/V7ErrorBoundary.js`

Captured signals:
- React render failures,
- `window.error`,
- unhandled promise rejections,
- network/server API failures,
- slow API requests.

Events are buffered in session storage until an authenticated workspace exists, then batched. Telemetry failures never block the product flow and telemetry writes are excluded from self-observation recursion. Diagnostics inserts explicitly avoid invalidating domain read caches; successful batches drain the remaining backlog automatically; context values/component stacks are bounded before persistence so a single oversized diagnostic cannot stall the queue.

## 4. Production telemetry security contract
Production migrations:
- `20260810092620` — `v7_client_telemetry`
- `20260810092938` — `v7_client_telemetry_performance_hardening`

`public.client_telemetry_events` properties:
- RLS enabled.
- authenticated INSERT only.
- no authenticated SELECT.
- no anon INSERT/SELECT.
- `user_id` defaults to `auth.uid()`.
- policy requires active membership in `company_id`.
- bounded event/message/context sizes.
- no `SECURITY DEFINER` ingestion RPC.

Rollback smoke as a real authenticated Postgres role context:
- same-company insert = accepted,
- automatically derived user id = expected authenticated user,
- cross-company insert = denied,
- rows remaining after rollback = 0.

## 5. Advisor-driven performance hardening
The first Supabase Performance Advisor run identified two telemetry-specific issues:
- unindexed `user_id` foreign key,
- repeated `auth.uid()` evaluation inside RLS.

The second migration added `idx_client_telemetry_user_created` and changed policy predicates to `(select auth.uid())`.

The follow-up advisor run no longer reports either actionable issue. The three telemetry indexes are reported only as `unused_index` INFO because the table has not accumulated production traffic yet; they are retained for FK delete safety, incident lookup and fingerprint/company time-window analysis.

## 6. Runtime dependency sweep
Current `src/v7` has no:
- import from legacy Engineering assets,
- `/#/engineering` navigation,
- product-facing "open old editor" fallback.

One compatibility item remains intentionally: `legacySessionStorageKey` can migrate a pre-cutover session into the V7-scoped session key and immediately removes the old key. It is a one-time continuity bridge, not a runtime/UI dependency.


## 6.1 Migration-ledger reconciliation
A pre-checkpoint secret/migration sanity pass found that the first V7 SQL files still carried development proposal timestamps, while Production had recorded the same named changes under the actual applied versions. The standalone `v7_work_context_filters` draft was also still inside the active migration directory even though its context filters had been folded into `v7_work_read_performance` before Production application.

The active migration chain was reconciled to the exact 10 Production versions. The superseded context-filter draft was moved to `docs/archive/migrations` and the V7 contracts now validate the canonical optimized Work migration rather than the obsolete intermediate CTE layout. `npm run test:v7` and the full release suite pass after reconciliation.

## 7. Validation closure
- `npm run test:release` — PASS.
- `npm run test:v7` — PASS.
- `npm run test:v7:visual` — PASS.
- V7 browser CSS matrix: 11 cases, all 0 px horizontal overflow.
- First-login fields are also asserted to remain inside the security card; the desktop RTL phone/WhatsApp containment defect found during screenshot review was fixed and re-tested.
- telemetry live RLS rollback smoke — PASS.
- telemetry Performance Advisor actionable warnings — CLOSED.

## Still open
- Real `next build`: **OPEN**, current environment reports `next: not found`.
- Actual deployed V7 browser E2E: **OPEN**.
- Deployed first-login + invitation click-through: **OPEN**.
- Final Auth redirect/CORS origin configuration: **OPEN**.
- Leaked-password protection: **OPEN**.
- Backup/PITR restore drill: **OPEN**.
- External alert notification routing: **OPEN**.

## Release interpretation
The V7 frontend can now fail visibly and record tenant-safe technical diagnostics without depending on the legacy Engineering/first-login UI. The remaining blockers have moved to deployment/runtime configuration and recovery proof, not unresolved client architecture.
