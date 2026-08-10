# Optimum V7 — Checkpoint 12

Date: 2026-08-10

## What this checkpoint closes
- V7 deployment configuration is portable through `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, with safe current-project public fallbacks.
- `.env.example` is checked in while `.env*` stays ignored; no secret/service-role credential is present in the example.
- Production `v7-member-invitation` Edge Function upgraded to **version 2**, `ACTIVE`, `verify_jwt=true` with fail-closed application-origin and CORS rules.
- Arbitrary HTTPS Origin reflection is removed. Non-local invitation requests require `OPTIMUM_APP_URL` or `OPTIMUM_ALLOWED_ORIGINS` configuration.
- Machine-readable `release:preflight` now identifies the exact local release blocker instead of a narrative-only checklist.
- Post-deploy smoke script added for V7 route, invite route, favicon and security headers.
- Production recovery baseline captured; every current integrity invariant is zero.
- Read-only recovery validator and baseline comparator added, including a verified mismatch failure path.
- Deployment/recovery runbook and Go-Live checklist updated.

## Production changes in this checkpoint
No database migration was added. V7 Production database migration count remains **10**.

Edge Function change:
- `v7-member-invitation` version **2**
- status at deployment: `ACTIVE`
- `verify_jwt=true`
- deployment SHA-256: `840b3893ed47d6da45ebbabc3751ff8b27c9460ddf2c81049276bc55b5accefa`

## Recovery evidence
Production baseline captured at `2026-08-10T10:41:51.504901Z`.

Key integrity observations:
- 79 public tables / 79 with RLS.
- 0 document current-version integrity errors.
- 0 ready document versions missing Storage objects.
- 0 ready Engineering assets missing Storage objects.
- 0 active membership/Auth-user breaks.
- 0 Project/Site/Task tenant mismatches.
- 0 inline Engineering Base64 images.

A real backup/PITR restore has **not** yet been executed; the tooling does not substitute for that drill.

## Local preflight state
`npm run release:preflight` currently reports:
- all source/config/migration/security/recovery checks: **PASS**
- `next-binary`: **FAIL**
- final decision: **NO-GO — 1 blocking local gate**

The container has no installed Next binary and cannot resolve public package registries. No production build success is claimed.

## Validation
- `npm run test:v7` after deployment-readiness changes — **PASS**.
- Recovery comparator exact-match fixture — **GO**.
- Recovery comparator injected-integrity-failure fixture — **NO-GO** as required.
- `npm run test:release` — **PASS** on the final source tree.
- `npm run test:v7:visual` — **PASS**, 11/11 browser fixture cases.
- `npm run release:preflight` — expected **NO-GO with exactly one blocker**: missing installed Next binary.
- Post-deploy negative control against the legacy portable server — expected **NO-GO** despite HTTP 200, proving the smoke does not mistake the legacy shell for V7.
- Secret/package sanity — **0** secret-candidate files, **0** private `.env` files, **0** `node_modules/.next` directories included in the source checkpoint.

## Remaining blocking gates
1. Network-capable clean dependency install and real `next build`.
2. Final HTTPS V7 domain deployment.
3. Set Edge allowed-origin environment for that domain.
4. Configure Supabase Auth Site/Additional Redirect URLs and enable leaked-password protection.
5. Real authenticated browser E2E and cross-company/restricted-member probes.
6. Post-deploy telemetry + external alert routing.
7. Real backup/PITR non-production restore drill with measured RPO/RTO.
