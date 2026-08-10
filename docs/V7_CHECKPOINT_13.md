# Optimum V7 — Checkpoint 13

Date: 2026-08-10

## What this checkpoint closes
- Provider-neutral Next standalone production output contract.
- Non-root multi-stage Docker production runtime with health check.
- Machine-readable `/api/health` identity including release and V7 schema head.
- Strict build environment validation for staging/production release artifacts.
- CI workflow for regressions, visual QA, build, standalone packaging and exact-container smoke.
- Manual staging/production release-handoff workflow with immutable artifact creation.
- Post-deploy release identity verification through `EXPECTED_RELEASE`.
- Playwright browser launcher now works with local system Chromium or CI-installed bundled Chromium.

## Production changes
No database migration and no new Production data mutation were performed in this checkpoint.

Production database V7 migration count remains **10**.

The invitation Edge Function remains:
- `v7-member-invitation` version **2**,
- `ACTIVE`,
- `verify_jwt=true`,
- strict fail-closed application origin/CORS contract.

## Validation
- `npm run release:env:strict` with explicit reviewed public values — **GO**.
- `npm run test:release` — **PASS**.
- `npm run test:v7` — **PASS** including the expanded deployment-readiness contract.
- `npm run test:v7:visual` — **PASS**, 11/11 browser fixture cases.
- CI and release workflow YAML parse check — **PASS**.
- `npm run release:preflight` — expected **NO-GO with exactly one blocker**: the installed Next binary is absent in this execution environment.

## Remaining external proof
1. Run the new CI pipeline on a network-capable GitHub runner.
2. Prove `npm ci` + actual Next 16 production build.
3. Prove the exact Docker image boots and passes `/api/health` + post-deploy smoke.
4. Deploy the exact artifact to staging/final HTTPS origin.
5. Configure Edge/Auth origin allowlists and execute authenticated E2E.
6. Complete telemetry alert routing and real backup/PITR restore drill.
