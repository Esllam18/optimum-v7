# Optimum V7 — Release Gates: Auth Invitation, CAD Persistence & Security

Date: 2026-08-10
Production Supabase project: `wzcaquxuvqfbstpxujsj`

## Executive status
This pass closed two material release risks that were still ambiguous at Checkpoint 09:

1. The CAD logo/Base64 persistence problem is no longer pending. Live Production data is already asset-referenced and the Engineering save path is now fast for both no-op and real changes.
2. V7 member invitations now have a dedicated Auth activation flow without temporary passwords. The new Edge Function is deployed independently of the V6.9 provisioning functions so the legacy path is not broken.

The remaining launch blockers are environment/configuration gates rather than unresolved database-performance logic: real Next build/runtime, a full authenticated invite click-through on the deployed origin, Auth redirect allowlist + leaked-password protection, and backup/PITR restore verification.

## 1. Invitation preview contract restored before authentication
Postgres logs exposed a real invite-page regression: `permission denied for function invitation_preview`. The existing invitation landing experience needs to preview company/role/email before the invitee has authenticated.

Production migration applied:
- `20260810084546` — `v7_invitation_preview_public_token_scope`

The migration grants `EXECUTE` on **only** `public.invitation_preview(text)` to `anon` and `authenticated`. The function remains `SECURITY DEFINER` and performs a SHA-256 lookup of the supplied high-entropy invitation token.

Rollback smoke:
- valid synthetic token as `anon` → valid invitation metadata
- wrong token as `anon` → `{ "valid": false }`
- rollback complete
- persisted synthetic invitations after test → **0**

Supabase Security Advisor now intentionally reports `anon_security_definer_function_executable` for this one RPC. This is accepted and documented rather than hidden by weakening the flow or exposing tables directly.

## 2. Secure V7 member invitation flow
The old identity-provisioning Edge Functions create temporary credentials. V7 no longer uses that model.

### New Production Edge Function
- Name/slug: `v7-member-invitation`
- Status: **ACTIVE**
- Version: **1**
- `verify_jwt`: **true**
- Deployment SHA-256: `c26c08d6211edff9dc7aa0a0e6e07ba6b127d83bbd624cca6e53cf68b066355c`

The function:
- validates the caller's Auth session again inside the function
- calls canonical `create_company_invitation`, so `members.invite`, delegation and Owner-role restrictions remain backend-enforced
- validates/locks the application redirect origin
- uses Supabase Auth Admin `generateLink({ type: 'invite' })` for a new account
- does **not** create or return a temporary password
- returns existing confirmed accounts to the V7 invite landing page for ordinary sign-in instead of generating an admin-created login session for them
- revokes the just-created pending company invitation if Auth-link generation fails, avoiding orphan invitations.

### V7 activation surface
`src/v7/components/InviteActivation.js` now handles:
- Auth callback session capture
- token-scoped invitation preview
- invited-email vs current-account conflict blocking
- user-chosen strong password for new invited accounts
- normal sign-in for existing accounts
- canonical `accept_company_invitation` only after the correct Auth identity exists
- final navigation into `/v7` after membership activation.

The API client now contains explicit helpers for Auth callback capture, current-user password update and JWT-protected Edge Function invocation.

### Visual gate
The real V7 stylesheet and representative activation DOM pass Chromium checks at:
- desktop 1280x900 — light / RTL
- mobile 390x844 — dark / LTR
- mobile 390x844 — light / RTL

All invitation cases report **0 px horizontal overflow**. Email values are explicitly LTR-isolated inside RTL layouts and the activation CTA remains usable on mobile.

### Live invocation limitation
An authenticated external invocation of the new Edge Function has not been fabricated. The container runtime has no outbound DNS to the Supabase hostname, and no real user password/session credential was invented or reset just to make the smoke pass. Database checks confirm the attempted unauthenticated network probe created **0 Auth users** and **0 company invitations**.

The correct next live test is on the real deployed V7 origin after that origin is added to Supabase Auth Additional Redirect URLs.

## 3. CAD Base64 persistence gate is now closed
A recursive scan of all live `engineering_revisions.sheet_settings` found:
- inline `data:image/...;base64,...` values: **0**
- inline Base64 characters: **0**
- Engineering assets: **7**
- ready Engineering assets: **7**

The current frame logos are referenced through asset IDs in `titleBlockData`; they are no longer embedded in the revision JSON.

The main active draft currently has a small `sheet_settings` JSON and retains its normal snapshot/BOQ data. The previous multi-megabyte JSONB rewrite condition is gone.

### Save-path performance after asset migration
Rollback profiling against the live draft:
- 10 true no-op `save_engineering_draft` calls: **17.322 ms total** (~1.7 ms/call)
- one save with an actual temporary snapshot change: **15.029 ms**
- rollback verified: original lock version preserved and probe key absent.

This closes the former multi-second CAD save bottleneck at the database layer.

## 4. Test closure
After the Auth/CAD changes:
- `npm run test:v7` — **PASS**
- `npm run test:release` — **PASS** (full V6.9 regression + all V7 contracts)
- `npm run test:v7:visual` — **PASS**, including the new invitation activation matrix.

No V6.9 provisioning Edge Function was modified or removed.

## 5. Open production gates
The following are intentionally still open and must not be described as completed:

1. **Next production build/runtime** — package installation is blocked by the current execution environment/registry path; no `next build` success is claimed.
2. **Full live Auth invite click-through** — requires the deployed V7 origin and an actual authorized user session.
3. **Auth redirect allowlist** — the deployed V7 origin must be present in Supabase Auth Additional Redirect URLs.
4. **Leaked password protection** — Supabase Advisor still reports it disabled.
5. **Backup/PITR restore drill** — the connected Supabase tool surface does not expose backup/restore-to-nonproduction operations.
6. **External monitoring alerts** — V7 client diagnostics are now captured and persisted through a tenant-safe write-only telemetry table, but production thresholds and an external notification destination still need deployment configuration.

## Release position
Database performance and core V7 functional contracts are no longer the main blocker. The release decision should now hinge on proving the actual Next runtime and the real Auth/deployment configuration end to end, followed by backup/recovery verification.
