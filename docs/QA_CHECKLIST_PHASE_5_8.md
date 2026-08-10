# QA Checklist — Optimum 5.8 Organization OS Closure

## Automated contract gates
- [x] Full `npm test` from CAD 4.11 through Organization OS 5.8.
- [x] `test:orgos` passes.
- [x] Contract audit: 227 Actions / 54 Forms / 85 RPCs.
- [x] Runtime asset mirrors are byte-for-byte aligned.
- [x] Saved-view RLS/initplan cleanup is regression-tested.
- [x] Duplicate saved-view default index cleanup is regression-tested.

## Browser flows
- [x] Owner/client flow.
- [x] Organization OS flow.
- [x] Limited Engineer flow.
- [x] Mobile 390×844 flow.
- [x] Adaptive Policy flow.
- [x] Platform Console flow.

## Organization OS
- [x] Setup Journey renders 8 steps.
- [x] Readiness Score comes from the shared health engine.
- [x] Health issues and Fix Now routes render.
- [x] Work Settings save path is wired.
- [x] Organization structure renders.
- [x] Platform Console uses the same Organization Health RPC.

## Member 360 / access privacy
- [x] Member 360 renders effective permissions, blocked entitlements, scopes, organization context, work context, and security snapshot.
- [x] Compensation remains permission-gated.
- [x] Self access snapshot is allowed.
- [x] A `members.view`-only user cannot inspect another member's access snapshot.
- [x] Cross-member access inspection requires management/role-management authority.

## Saved Views / filters
- [x] Saved view RPC works against live Supabase inside rollback QA transaction.
- [x] User ownership is enforced by RLS.
- [x] RLS uses initplan-safe `(select auth.uid())`.
- [x] Duplicate partial default index removed.

## Bulk actions
- [x] Live bulk suspend succeeds inside rollback transaction.
- [x] Live Undo restores the original status/role inside rollback transaction.
- [x] Status is cast to `membership_status`.
- [x] Bulk RPCs use `app_private.has_company_permission`.
- [x] Owner cannot be assigned by bulk action.
- [x] 200-member operation cap remains enforced.

## Realtime/cross-session behavior
- [x] Organization runtime revision exists.
- [x] Trigger mapping handles direct and indirect company keys.
- [x] Browser polls organization revision.
- [x] Local tab signal is supported.
- [x] Lost route permission causes route fallback after policy refresh.

## Responsive / premium UX
- [x] Mobile page has no settled horizontal overflow.
- [x] Member 360 wide drawer fits the viewport after its 180ms animation.
- [x] Command Palette preserves Quick Actions while searching.
- [x] Quick Create only exposes actions allowed by permissions/entitlements.
- [x] sessionStorage is optional and cannot crash Organization OS.

## Live DB integrity
- [x] `membership_role_cross_company = 0`
- [x] `unit_membership_cross_company = 0`
- [x] `member_addon_cross_company = 0`
- [x] `scope_subject_wrong_company = 0`
- [x] `duplicate_active_offboarding = 0`

## Local runtime
- [x] Client `localhost:4173` returns HTTP 200.
- [x] Platform Console `localhost:4174` returns HTTP 200.
- [x] `Cache-Control: no-store`.
- [x] CSP present.
- [x] `X-Frame-Options: DENY`.
- [x] `X-Content-Type-Options: nosniff`.

## Still open before public production
- [ ] Prove `npm run build` after installing/pinning production dependencies; current package has no `node_modules`, so `next: not found`.
- [ ] Review public authenticated-callable SECURITY DEFINER functions one by one.
- [ ] Enable Supabase Leaked Password Protection.
- [ ] Run production/staging load + monitoring + backup/restore gates.
