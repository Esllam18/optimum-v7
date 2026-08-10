# QA Checklist — Optimum 6.9.0

## Database / Security
- [x] `site_cabinets` RLS enabled; authenticated direct mutation revoked.
- [x] Claim package/requirements/items RLS enabled; authenticated direct mutation revoked.
- [x] Writes only through permission/scope-aware RPCs.
- [x] RLS uses approved `resource_permission_for_row` wrapper.
- [x] Cabinet archive blocks mutations under cabinet folder tree.
- [x] Owner / Engineer live permission smoke passed.
- [x] 6.9 foreign keys have covering indexes; no new unindexed-FK Advisor notices.

## Claim correctness
- [x] Default final package provisioned for existing/new Sites.
- [x] Nine default requirements.
- [x] Custom requirement RPC.
- [x] Add/remove canonical Document reference.
- [x] No file copy when adding to claim.
- [x] Freeze rejects missing required items.
- [x] Freeze rejects non-ready current versions.
- [x] Freeze pins exact version IDs.
- [x] Reopen clears frozen version IDs before submission.
- [x] Submit requires Ready/Frozen package.
- [x] Auto Collect recognizes C01–C06 and common document patterns.
- [x] Auto Collect does not duplicate Documents/Versions.

## Cabinet correctness
- [x] Create/Edit/Archive/Reactivate RPCs.
- [x] Six standard cabinet workspace folders.
- [x] Cabinet inferred from document folder ancestry.
- [x] Cabinet 360 returns stats/readiness and scoped capabilities.

## UI / UX
- [x] Site Delivery 360.
- [x] Cabinet 360.
- [x] Claim Package 360.
- [x] File-card Add to Site Claim.
- [x] Upload-to-Claim option.
- [x] Auto Collect action.
- [x] Document 360 preserves 5 Document Control actions from 6.8.
- [x] Document top Download restored.
- [x] Document description restored.
- [x] Server-scoped Document/Site/Cabinet capabilities used in UI.
- [x] 390px mobile flow no horizontal overflow.
- [x] Limited Engineer UI contains no management mutations.

## Regression
- [x] `npm test` PASS.
- [x] Contract audit 251/57/113.
- [x] Core browser PASS.
- [x] Policy/Platform browser PASS.
- [x] Work browser PASS.
- [x] Work Excellence/Mobile PASS.
- [x] PDC Owner/Limited/Mobile PASS.
- [x] Site Delivery Owner/Limited/Mobile PASS.
- [x] Runtime 4173/4174 HTTP 200 + security headers + 6.9 marker.

## Not proven / release gates
- [ ] Next production build in a clean deployment environment.
- [ ] Full Fresh DB replay from migrations on Staging.
- [ ] System-wide SECURITY DEFINER allowlist/threat review.
- [ ] Enable leaked-password protection.
