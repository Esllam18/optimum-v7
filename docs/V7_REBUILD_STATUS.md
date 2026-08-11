# Optimum V7 Rebuild — Working Status

Date: 2026-08-10  
Production Supabase project: `wzcaquxuvqfbstpxujsj`

## Current position
V7 is a parallel frontend reconstruction under `/v7`, preserving the live Optimum domain/data model while replacing the legacy browser-runtime architecture. The V6.9 regression suite remains the compatibility baseline until cutover.

**Ten reviewed V7 migrations are applied to Production.** The newest database changes remain the write-only client diagnostics and RLS/index hardening. The latest production change is Edge Function `v7-member-invitation` **version 2**, which fails closed for unapproved browser/redirect origins.

## Foundation and runtime
- Next.js V7 catch-all route and dedicated layout.
- Premium responsive shell with company context, permission-aware navigation, global search, language/theme controls and request timing.
- Route-level dynamic loading rather than eager loading Work/CAD/People/Delivery code on dashboard entry.
- Shared API layer with scoped session storage, refresh mutex, request deduplication, short TTL caching, timing metrics, signed-object caching, secure uploads/downloads and generic protected inserts.
- Supabase browser URL/publishable key can now be supplied through `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the reviewed current-project values remain safe public fallbacks.
- Lightweight workspace bootstrap instead of the legacy all-domain fan-out.
- One-time compatibility bridge may migrate an existing pre-cutover session key into the V7-scoped session key, then deletes the old key. No V7 UI route depends on the legacy application runtime.

## Native V7 workflows connected
- Dashboard, Projects, Project 360, Sites and Site 360.
- Cabinet creation/360 with canonical C01–C06 evidence structure.
- Project/Site/Cabinet edit, archive/reactivate and impact review where applicable.
- Work list, Task 360, contextual quick-create, server paging/filtering.
- Documents/CDE, folder browsing, server search, two-phase upload, immutable versions, Document 360, secure downloads, rename/move/review/trash/restore.
- Claim evidence linking without file duplication; Claim Package freeze/reopen/submit controls.
- People directory with server-side paging/search; Member 360.
- Secure member invitation with user-chosen password and no temporary-password delivery. Production Edge Function V2 enforces a strict application-origin allowlist and no longer reflects arbitrary HTTPS origins in CORS.
- Native first-login security inside V7 using the existing trusted `identity-provisioning-v55` `complete_first_login` contract.
- Delivery directory and Claim Package 360.
- Governance/Control using live organization health/readiness/role data.

## Engineering / CAD
- The V7 CAD workspace no longer imports the giant legacy `assets/engineering.js` runtime.
- Proven pure CAD algorithms were extracted into `src/v7/lib/cadCore.js`.
- A parity contract compares V7 and legacy outputs for normalization, takeoff, validation, DXF and SVG on deterministic fixtures.
- No V7 Engineering route sends users back to the previous UI.
- Live revision data contains **0 inline Base64 images** in `sheet_settings`; Engineering assets are object-referenced.
- Live Engineering assets observed: **7 ready / 7 total**.
- Rollback profiling after asset migration:
  - 10 true no-op `save_engineering_draft` calls: **17.322 ms total** (~1.7 ms/call).
  - one actual temporary snapshot change: **15.029 ms**.

## Observability / client diagnostics
V7 now has technical diagnostics separate from business audit events:
- React render error boundary.
- global `window.error` capture.
- `unhandledrejection` capture.
- slow-request diagnostics at the configured threshold.
- API/network failure diagnostics.
- session-buffered events before workspace context is available.
- batched protected writes after a valid user/company context exists.
- diagnostics writes do not invalidate domain read caches.
- successful batches automatically drain any remaining buffered backlog.
- diagnostic context is bounded/sanitized before persistence so an oversized component stack cannot poison the queue.

Production table: `public.client_telemetry_events`.

Security model:
- RLS enabled.
- `authenticated`: **INSERT only**.
- `authenticated`: **no SELECT**.
- `anon`: **no INSERT / no SELECT**.
- insert policy requires `user_id = (select auth.uid())` and active membership in the supplied company.
- no new `SECURITY DEFINER` ingestion RPC.
- context payload size is bounded.

Rollback-only live RLS smoke proved:
- valid active-company insert: accepted.
- `user_id` defaulted to the authenticated subject.
- cross-company insert: denied.
- persisted probe rows after rollback: **0**.

Supabase Performance Advisor initially identified an unindexed `user_id` FK and repeated `auth.uid()` evaluation. Both were fixed by `v7_client_telemetry_performance_hardening`; the follow-up advisor run no longer reports either warning. New telemetry indexes are currently reported only as expected `unused_index` INFO because the table is new.

## Major performance results retained
- Work `+300 tasks`: ~1.92 s before → **15.97 ms average** after V7 read-model optimization.
- Project 360 `+300 tasks + 3,000 documents`: ~1.09 s before → **8.55 ms average**.
- Site 360 `+300 tasks + 3,000 documents`: ~771 ms before → **15.12 ms average**.
- Dashboard Work metrics `+300 tasks`: ~2.63 s before → **1.42 ms average**.
- Delivery directory `+500 temporary claim packages`: **7.55 ms average**.
- CDE folder snapshot with 3,000 temporary documents: ~182 ms; document search: ~120 ms.
- Synthetic profiling rows were rolled back/removed; no release-probe telemetry rows remain.

## V7 Production migrations applied
1. `20260809225541` — `v7_work_read_performance`
2. `20260809225906` — `v7_project360_read_performance`
3. `20260809230046` — `v7_engineering_draft_fast_path`
4. `20260809230254` — `v7_site360_read_performance`
5. `20260809231816` — `v7_people_directory_security_contract`
6. `20260809232122` — `v7_dashboard_metrics_performance`
7. `20260809232304` — `v7_delivery_directory`
8. `20260810084546` — `v7_invitation_preview_public_token_scope`
9. `20260810092620` — `v7_client_telemetry`
10. `20260810092938` — `v7_client_telemetry_performance_hardening`
11. `20260810221851` — `v7_feature_parity_saved_views_bulk_cde`

The active local migration filenames are aligned 1:1 with the live Production ledger for reproducible replay. The earlier standalone `v7_work_context_filters` draft was already folded into `v7_work_read_performance`; it is archived outside `supabase/migrations` so a future CLI push cannot attempt to apply it as an extra migration.

## Validation
- `npm run test:release` — **PASS**: complete V6.9 regression + V7 contracts.
- `npm run test:v7` — **PASS** after native CAD extraction, native first-login, telemetry hardening and expanded CI/deployment-readiness contracts.
- `npm run release:preflight` — **NO-GO with exactly one local blocker**: `next-binary` is not installed. All source, migration, legacy-independence, Edge-origin and recovery-artifact checks pass.
- `npm run test:v7:visual` — **PASS** in Chromium.
- Browser fixture matrix now covers **13 cases**:
  - application shell: desktop dark LTR, desktop light RTL, tablet dark RTL, mobile dark LTR, mobile light RTL.
  - invitation activation: desktop light RTL, mobile dark LTR, mobile light RTL.
  - first-login security: desktop light RTL, mobile dark LTR, mobile light RTL.
  - parity tranche 18: desktop light RTL, mobile dark LTR (People bulk, Member Control, Organization OS and claim collection).
- All 13 cases report **0 px horizontal document overflow**.
- First-login mobile profile/password/rule grids collapse to one column; long account email remains LTR-isolated inside RTL.
- Desktop first-login field containment is asserted against the card itself; a discovered RTL phone/WhatsApp field escape was fixed before checkpoint freeze.
- Browser fixture QA uses the real V7 CSS and representative DOM. It is not a substitute for the blocked live Next runtime browser test.

## Security status
- Public `SECURITY DEFINER` functions: **162**.
- Authenticated-executable: **153**.
- Anon-executable: **1**, the intentional token-scoped `invitation_preview(text)` exception.
- `invitation_preview` remains an accepted pre-auth advisor warning because the invite landing page needs token-scoped metadata before login.
- Leaked-password protection is still reported **disabled** by Supabase Advisor.
- Full rationale remains in `docs/V7_SECURITY_DEFINER_ALLOWLIST.md`.

## Deployment/recovery readiness added after Checkpoint 11
- `.env.example` contains only browser-safe public V7 configuration; secret/service-role material is explicitly excluded.
- `scripts/release-preflight.mjs` provides a machine-readable source/build GO/NO-GO gate.
- Next is configured for provider-neutral `output: 'standalone'`; `scripts/prepare-standalone.mjs` packages public/static assets and release metadata into the traced runtime.
- `/api/health` returns machine-readable V7 runtime identity, release ID and schema head with no caching.
- Root `Dockerfile` is a multi-stage non-root standalone runtime with an integrated `/api/health` health check.
- `.github/workflows/v7-ci.yml` defines lockfile install, complete regressions, visual QA, production build, standalone artifact and exact-container smoke.
- `.github/workflows/v7-release-handoff.yml` is the strict manual staging/production artifact gate and can verify an already-deployed origin.
- `scripts/postdeploy-smoke.mjs` checks `/api/health`, exact release identity when `EXPECTED_RELEASE` is supplied, `/v7`, `/v7/invite`, favicon and required security headers.
- Production `v7-member-invitation` Edge Function is **version 2 / ACTIVE / verify_jwt=true** with fail-closed origin/CORS enforcement. A real non-local invite intentionally returns a configuration error until `OPTIMUM_APP_URL` or `OPTIMUM_ALLOWED_ORIGINS` is set to the approved deployed origin.
- A production recovery baseline was captured at `2026-08-10T10:41:51.504901Z`; all live integrity invariants were zero.
- Read-only restore validator: `supabase/tests/v7_recovery_validation.sql`.
- Recovery comparator: `scripts/recovery-compare.mjs`; it was tested with an exact-match fixture (**GO**) and an injected invariant failure (**NO-GO**).

## Feature parity restoration status
- Tranches 14–17 restored the V7 operating backbone, advanced Work/CDE actions, full Work editor/smart assignment, saved views, bulk document control and CAD revision/favorite depth.
- Tranche 18 restores Member Control 360, People bulk role/status actions with undo, Organization setup/health/editing depth and canonical Site Delivery claim collection suggestions/auto-collect/removal.
- Legacy parity is still open; governance/offboarding/compensation editing, settings/security/connections and remaining CAD/CDE/Delivery depth continue in subsequent tranches.

## Open release gates — do not describe as complete
1. **Next production build/runtime** — `next` is still not installed in this execution environment; public package registries are DNS-blocked. No build success is claimed.
2. **Final V7 deployment origin** — deploy the reviewed checkpoint, then run `BASE_URL=https://<final-domain> npm run release:postdeploy`.
3. **Edge production origin secret** — set `OPTIMUM_APP_URL` or `OPTIMUM_ALLOWED_ORIGINS` to the approved final origin.
4. **Supabase Auth URL configuration** — final V7 invite target/origin must be allowed; leaked-password protection must be enabled/verified.
5. **Authenticated deployed E2E** — login, first-login, new/existing invite, wrong-account guard, company switch and core Work/CDE/CAD/Delivery writes.
6. **Monitoring delivery** — controlled deployed error/slow request must reach telemetry and external alert routing must be proven.
7. **Backup/PITR restore drill** — baseline/validator tooling is ready, but a real recovery point must still be restored into a non-production target and RPO/RTO recorded.

## Next execution sequence
1. Push/run `.github/workflows/v7-ci.yml` in a network-capable GitHub runner; it must prove `npm ci`, regressions, visual QA, Next build, standalone packaging and exact-container smoke.
2. Deploy the exact checkpoint and set the final Edge origin configuration.
3. Configure Supabase Auth Site/Additional Redirect URLs and leaked-password protection.
4. Run `npm run release:postdeploy` against the final HTTPS origin.
5. Run real authenticated browser flows and a restricted-user/cross-company matrix.
6. Trigger controlled telemetry and validate alert routing/log triage.
7. Restore an actual backup/PITR point to non-production, run `v7_recovery_validation.sql`, compare to the matching baseline and record RPO/RTO.
8. Only then issue the production GO decision.

## Feature parity tranche 19

Governance, controlled offboarding, compensation editing, richer company contacts, account-security visibility, and connection/runtime status have been restored in V7 using existing production-safe contracts. Schema head remains `20260810221851`. Final go-live remains intentionally paused until all legacy feature-parity and authenticated E2E gates close.
