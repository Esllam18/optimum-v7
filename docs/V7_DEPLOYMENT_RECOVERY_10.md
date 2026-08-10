# Optimum V7 — Deployment & Recovery Gate 10

Date: 2026-08-10  
Production Supabase project: `wzcaquxuvqfbstpxujsj`

## Purpose
This gate converts the remaining release work into executable deployment and recovery checks. It does **not** declare public cutover ready while the real Next build, final domain configuration, authenticated deployed E2E and real backup/PITR restore are still unproven.

## 1. Deployment portability
V7 browser configuration is now environment-driven:

```env
NEXT_PUBLIC_SUPABASE_URL=https://wzcaquxuvqfbstpxujsj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The checked-in `.env.example` contains only public browser configuration. Do not place a service-role key, secret key, database password or Edge Function secret in any `NEXT_PUBLIC_*` variable.

Current-project public values remain safe fallbacks so the reviewed Optimum project does not break if an existing deployment omits the new variables. A different environment should always override both values explicitly.

## 2. Invitation origin hardening — Production Edge V2
`v7-member-invitation` was deployed as **version 2**, remains `verify_jwt=true`, and now fails closed for redirect/CORS origins.

Production deployment identity:
- Function: `v7-member-invitation`
- Version: `2`
- Status at deploy: `ACTIVE`
- Deployment SHA-256: `840b3893ed47d6da45ebbabc3751ff8b27c9460ddf2c81049276bc55b5accefa`

Rules:
- `localhost` / `127.0.0.1` are allowed only as development origins.
- A non-local browser origin must be present in `OPTIMUM_APP_URL` or `OPTIMUM_ALLOWED_ORIGINS`.
- The requested redirect origin must match the browser `Origin` when one is present.
- CORS no longer reflects arbitrary HTTPS origins.
- If no production origin is configured, a non-local request fails closed instead of falling back to arbitrary HTTPS.

### Required final-domain configuration
Once the final V7 URL exists, configure the Edge Function environment with one of:

```text
OPTIMUM_APP_URL=https://<final-domain>
```

or:

```text
OPTIMUM_ALLOWED_ORIGINS=https://<final-domain>,https://<approved-staging-domain>
```

The connected Supabase toolset in this environment does not expose Edge secret mutation, so this remains a deployment action in Supabase Dashboard or CLI.

## 3. Supabase Auth URL configuration
Before invitation E2E, the hosted Auth configuration must allow the final V7 origin. At minimum verify:
- Site URL / intended primary application URL is correct.
- Additional Redirect URLs contains the deployed V7 invitation target, e.g. `https://<final-domain>/v7/invite` (or the approved equivalent pattern used by the deployment team).
- Leaked-password protection is enabled and the Advisor warning clears.

These are **BLOCKING** because the secure invitation flow intentionally relies on Auth's redirect allowlist as an additional defense.

## 4. Machine-readable local preflight
Run:

```bash
npm run release:preflight
```

The script verifies Node version, required source files, lockfile dependency records, an installed Next binary, exact V7 migration chain, no legacy CAD runtime import/redirect, Edge caller/origin hardening, and recovery artifacts.

Current environment result: all source/contract gates pass; **`next-binary` is the single blocking local gate** because external package DNS is unavailable and Next is not installed.

Do not override that failure and call the build successful. Run `npm ci` and `npm run build` in the actual deployment environment.

## 5. Post-deploy HTTP smoke
After a successful build/deploy:

```bash
BASE_URL=https://<final-domain> npm run release:postdeploy
```

It checks:
- `/v7` returns a successful response containing a V7-specific render marker.
- `/v7/invite` is routable.
- favicon is available.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` is present.

HTTP is rejected for production-style runs unless `ALLOW_HTTP=1` is deliberately supplied for a controlled local/staging target.

## 6. Recovery baseline captured from Production
Checkpoint baseline captured at `2026-08-10T10:41:51.504901Z` is stored at:

`docs/recovery/V7_RECOVERY_BASELINE_20260810T104151Z.json`

At that point:
- Auth users: 5
- Companies: 4
- Memberships: 5 active / 5 total
- Projects: 5 active / 5 total
- Sites: 2
- Tasks: 4
- Documents: 3; versions: 4
- Storage: 15 objects / 18,240,278 bytes
- Engineering: 2 drawings / 3 revisions / 7 ready assets
- Inline Engineering Base64 images: 0
- Claim packages: 2
- Migration count: 128; head: `20260810092938`
- Public tables: 79; RLS tables: 79; policies: 95

Fingerprints:
- Public schema: `84301b93fd52bdd7307b9782003cd0af`
- Public policies: `bef3a12e0fd3c2bba5e500e82739360b`
- Public functions: `4d8277100280ed5415df87437a450e2e`

All captured integrity invariants were zero, including missing Storage objects, invalid current document versions, missing Auth users for memberships, tenant-key mismatches and public tables without RLS.

## 7. Restore drill procedure — still BLOCKING until executed
A real restore drill must use a backup/PITR point and a **non-production** target.

1. Capture/regenerate the baseline for the exact recovery point being tested. Do not compare a future restore to the historical checkpoint counts if the source database changed after that point.
2. Restore Database, Auth and Storage according to the active Supabase backup/PITR capability.
3. Run the read-only validator:
   `supabase/tests/v7_recovery_validation.sql`
4. Save its JSON result to a file.
5. Compare it to the matching baseline:

```bash
npm run release:recovery-compare -- \
  docs/recovery/<matching-baseline>.json \
  /path/to/restored-validation.json
```

6. Require every invariant to be zero and the expected counts/schema-policy-function fingerprints to match the exact baseline point.
7. Perform application-level spot checks: login, company membership, document download, Engineering asset, Work task, Claim package.
8. Record measured RPO and RTO.

A schema replay or validator run on Production is useful evidence, but is **not a substitute** for restoring a real backup/PITR point into another environment.

## 8. Current decision
**NO-GO for public cutover.**

The source/migration/security contract is ready for a deployment environment, but the following remain blocking:
1. Real dependency install + `next build`.
2. Final deployed V7 domain.
3. Edge `OPTIMUM_APP_URL` / approved-origin configuration.
4. Supabase Auth redirect configuration + leaked-password protection.
5. Real authenticated invite/first-login/core-workflow browser E2E.
6. Post-deploy HTTP smoke and telemetry/alert proof.
7. Real non-production backup/PITR restore drill with recorded RPO/RTO.
