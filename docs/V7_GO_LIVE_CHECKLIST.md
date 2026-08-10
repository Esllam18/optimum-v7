# Optimum V7 — Go-Live Checklist

Date: 2026-08-10

A production GO is allowed only when every **BLOCKING** item is checked with evidence from the final deployment environment.

## Build & deploy — BLOCKING
- [x] Provider-neutral standalone build contract, Docker runtime, CI pipeline and strict release-handoff workflow are prepared and contract-tested.
- [x] `/api/health` identifies V7 runtime, schema head and release ID; post-deploy smoke can enforce `EXPECTED_RELEASE`.
- [ ] Clean dependency installation succeeds from a network-capable CI/deployment environment.
- [ ] `next build` succeeds with zero unresolved compile/runtime errors in that environment.
- [ ] Exact production Docker image boots and passes integrated health + post-deploy smoke.
- [x] Active V7 migration filenames match the exact reviewed Production ledger.
- [ ] Deployment uses the exact reviewed checkpoint/migration ledger.
- [ ] `/v7` loads directly on a fresh browser session and hard refresh.
- [x] No V7 route requires the previous Engineering application UI runtime.

## Auth & identity — BLOCKING
- [ ] Final V7 origin is in Supabase Auth Additional Redirect URLs.
- [x] Invitation Edge Function V2 fails closed for unapproved origins and CORS reflection is allowlisted.
- [ ] Edge Function production secret (`OPTIMUM_APP_URL` / approved allowlist) contains the final V7 origin.
- [ ] Leaked-password protection is enabled and verified.
- [ ] Existing user login succeeds.
- [ ] Native first-login flow succeeds end to end.
- [ ] New-account company invitation succeeds: email → Auth invite → password → company acceptance.
- [ ] Existing-account invitation succeeds through ordinary login.
- [ ] Wrong signed-in account is blocked from accepting another email's invitation.
- [ ] Invite expiry/revocation behavior is verified.

## Tenant/security isolation — BLOCKING
- [x] Telemetry write requires active company membership (rollback RLS smoke).
- [x] Telemetry has no client SELECT grant.
- [x] Anonymous telemetry access is denied.
- [x] Invitation preview anon exposure is limited to the reviewed token-scoped RPC.
- [ ] Final deployed role/permission/resource-scope browser matrix passes with at least admin + restricted member identities.
- [ ] Cross-company URL/entity probes return denial/not-found without data leakage.

## Core workflows — BLOCKING
- [ ] Project create/edit/archive/reactivate on deployed runtime.
- [ ] Site + Cabinet create and 360 navigation.
- [ ] Work create/update/status/checklist/comment/assignment paths.
- [ ] CDE initial upload, new version, secure download, move, review, trash, restore.
- [ ] CAD open/edit/autosave/recovery/takeoff/DXF/SVG on actual runtime.
- [ ] Claim evidence add/remove and package freeze/reopen/submit.
- [ ] People directory/member detail/invite.
- [ ] Company switch invalidates/reloads tenant-scoped data correctly.

## Performance — BLOCKING
- [x] V7 DB hotspot migrations profiled and applied.
- [x] CAD live save path reduced to millisecond range after asset migration.
- [x] Telemetry RLS init-plan + FK index advisor findings resolved.
- [ ] Deployed route load/API timings captured under representative browser use.
- [ ] No unexpected repeated polling/fetch storm after idle and token refresh.
- [ ] Load test performed in staging/preview for expected launch concurrency.

## UI / responsive / accessibility — BLOCKING
- [x] Fixture matrix passes 11 desktop/tablet/mobile RTL/LTR dark/light cases with 0 px horizontal overflow.
- [x] Invitation activation mobile/RTL visual gate passes.
- [x] First-login mobile/RTL visual gate passes.
- [ ] The same checks pass on actual deployed Next pages, not fixtures only.
- [ ] Keyboard navigation/focus and reduced-motion behavior spot-checked on deployed runtime.

## Monitoring & incident readiness — BLOCKING
- [x] Client render/unhandled/network/slow-request diagnostics implemented.
- [x] Tenant-safe write-only telemetry persistence implemented.
- [ ] Controlled deployed error produces a telemetry row with expected company/user/fingerprint.
- [ ] Error/latency alert thresholds defined.
- [ ] External alert notification destination is configured and tested.
- [ ] Postgres/Auth/Storage/Edge logs have an agreed incident triage path.

## Backup / recovery — BLOCKING
- [x] Recovery baseline + read-only invariant validator + comparison script prepared and validated on synthetic match/failure cases.
- [ ] Current Supabase backup/PITR entitlement and retention verified.
- [ ] Non-production restore drill completed from a real backup/PITR point.
- [ ] Restored tenant membership, documents metadata, Engineering revisions and Work records spot-checked.
- [ ] RPO/RTO recorded and accepted.
- [ ] Rollback plan for frontend deployment and database migrations documented/tested.

## Current decision
**NO-GO for public production cutover yet.**

Reason: source/runtime architecture, DB performance, telemetry, strict invitation-origin handling, migration replay alignment, recovery validation tooling and the CI/standalone/Docker handoff are green, but the first network-capable CI build/container proof, final domain/Auth configuration, authenticated deployed E2E, external alerting and a real backup/PITR restore proof remain open.
