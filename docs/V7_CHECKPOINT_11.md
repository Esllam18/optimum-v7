# Optimum V7 — Checkpoint 11

Date: 2026-08-10

## What this checkpoint closes
- V7 CAD pure core extracted from the legacy Engineering UI runtime with deterministic parity tests.
- V7 Engineering no longer routes back to the previous Engineering UI.
- Mandatory first-login security is native inside V7 and still uses the trusted provisioning Edge Function contract.
- V7 client error/slow-request diagnostics are implemented with a React error boundary, global browser capture and persistent tenant-safe ingestion.
- Production telemetry RLS/grants were rollback-smoked for same-company acceptance and cross-company denial.
- Supabase Performance Advisor findings specific to telemetry were corrected with an FK-covering index and init-plan-safe `(select auth.uid())` policy checks.
- Telemetry writes do not invalidate business read caches, drain buffered batches automatically and bound context before persistence.
- First-login visual matrix was added. Screenshot review found a desktop RTL field-containment issue; it was fixed and the browser gate now asserts fields remain inside their card.
- Active V7 migration filenames were reconciled 1:1 with the Production ledger; the superseded Work context-filter draft was archived outside the active migration directory to prevent duplicate CLI application.

## Production changes in this checkpoint
Two additional migrations:
- `20260810092620_v7_client_telemetry`
- `20260810092938_v7_client_telemetry_performance_hardening`

V7 Production migration count: **10**.

No existing V6.9 Edge Function was changed in this checkpoint.

## Final evidence
- `npm run test:release` — **PASS** on the frozen source.
- `npm run test:v7:visual` — **PASS**.
- Browser fixture matrix — **11 / 11 PASS**, all with **0 px horizontal document overflow**.
- Telemetry RLS rollback probe rows persisted after test — **0**.
- Latest `npm run build` — **BLOCKED / exit 127**, `next: not found`; no build success is claimed.

## Release decision
**NO-GO for public cutover yet.**

Open blocking gates are deployment-environment gates: real Next production build, actual deployed browser E2E, final Auth redirect/CORS configuration, leaked-password protection, authenticated invitation/first-login click-through, external alert routing, and a non-production backup/PITR restore drill.

See:
- `docs/V7_REBUILD_STATUS.md`
- `docs/V7_RELEASE_GATES_NATIVE_RUNTIME_OBSERVABILITY_09.md`
- `docs/V7_GO_LIVE_CHECKLIST.md`
