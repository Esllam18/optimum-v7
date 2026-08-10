# QA Checklist — Optimum 5.7.0

## Static / contract

- [x] package version = 5.7.0.
- [x] permission → entitlement mapping uses `permissions.entitlement_key`.
- [x] no legacy `entitlements.permission_key` access mapping in Access Engine.
- [x] runtime policy contract includes permissions, entitlements, limits, and usage.
- [x] page routing is permission-driven.
- [x] stale DOM actions are guarded before execution.
- [x] file versioning is feature-gated in UI and backend migration.
- [x] search RPC checks `search.use`.
- [x] plan limit helpers are wired to members/projects/storage creation flows.
- [x] Team / Role / Project hidden cards use `display:none!important` when filtered.
- [x] Platform Console explains entitlement impact and includes disable confirmation.
- [x] runtime asset copies are byte-identical.
- [x] runtime entrypoints reference 5.7.0 cache keys.

## Full automated suite

- [x] CAD 4.11 → 4.17 regression suite.
- [x] Identity / provisioning 5.1.
- [x] Organization / role studio 5.2.
- [x] Operational workflows 5.3.
- [x] Session isolation 5.3.2.
- [x] System contract audit.
- [x] Organization control center 5.4.
- [x] Access Engine 5.5.
- [x] First-login / workspace loading 5.5.2.
- [x] Stability 5.5.3.
- [x] Runtime reliability 5.5.4.
- [x] Adaptive workspace policy 5.7.

Current contract scan: **209 Actions / 51 Forms / 75 RPCs**.

## Browser workflow

- [x] Role draft and impact workflow.
- [x] Role Members opens in-context dialog.
- [x] Owner role cannot be assigned through member provisioning.
- [x] Normal role can seed Create Member form.
- [x] Create Member payload still works in browser workflow.
- [x] Settings save workflow.
- [x] Activity UI.
- [x] Team search actually hides all unmatched member cards and shows empty state.
- [x] Roles search actually filters cards.
- [x] Projects search actually filters cards.
- [x] Disabling mocked `module.members` while Team is open removes Team navigation after policy refresh.
- [x] Disabling mocked `module.search` removes the command-search trigger.
- [x] Current route falls back to Dashboard when its module becomes unavailable.
- [x] Platform Console role-template and create-company browser workflows remain working.

## Live Supabase verification

- [x] `workspace_runtime_policy` migration applied.
- [x] `global_search` hardening migration applied.
- [x] `begin_new_version_upload` checks `feature.file_versioning`.
- [x] Live simulated authenticated Runtime Policy for a company with Files/Members/Search overrides disabled returned all three entitlements disabled and removed their linked effective permissions.
- [x] Live policy returned effective plan limits and current usage.

## Portable servers

- [x] Client 4173 returns HTTP 200.
- [x] Platform Console 4174 returns HTTP 200.
- [x] CSP present.
- [x] `X-Frame-Options: DENY`.
- [x] `X-Content-Type-Options: nosniff`.
- [x] `Cache-Control: no-store`.
- [x] served HTML references 5.7.0.

## Production gates still open

- [ ] `next build` — current portable package has no installed `next` binary / node_modules (`next: not found`).
- [ ] Review Supabase SECURITY DEFINER advisor findings individually before public production. Do not mass-convert them because many are intentionally privilege-bound RPCs and require function-by-function threat review.
- [ ] Enable Supabase leaked-password protection before public production.
- [ ] Run a real authenticated browser E2E using production-like accounts/domains before public release. Current browser workflow uses controlled mocked Supabase; Runtime Policy itself was also checked live through an authenticated SQL simulation.
