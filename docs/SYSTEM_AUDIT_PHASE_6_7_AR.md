# System Audit — Optimum 6.7.0 Work Experience Excellence

## Executive assessment
6.7 was built only after 6.6 passed its baseline regression. The main architectural direction is retained: **entitlement → permission → resource scope → organization context → Work action**. The release focuses on daily usability and decision support without moving authorization into the browser.

## Code/UI
- Work default landing changed to Cockpit.
- Work360 uses capability-aware actions.
- Risk/Capacity/Dependency surfaces consume server data, not duplicated client calculations as the authority.
- Calendar drop routes through atomic `save_work_item` and optimistic locking.
- Automation UI no longer exposes raw action JSON.
- Workflow builder creates explicit step definitions and server-side dependencies.
- CSS and runtime asset copies are synchronized across portable, public, Next, and Platform assets.

## Database
New 6.7 contracts:
- `work_cockpit_snapshot`
- `work_capacity_plan`
- `work_dependency_graph`
- `work_workflow_templates`
- `save_work_workflow_template`
- `instantiate_work_workflow_template`
- richer automation conditions/actions and due-soon scheduler processing.

### Live defects found and remediated
- Automation trigger CHECK drift prevented `task.due_soon` inserts. Fixed with a dedicated migration.
- Workflow table anon SELECT grant was wider than intended. Fixed with explicit Data API ACL lockdown.

## Authorization observations
- Personal Cockpit requires tasks.view.
- Capacity requires tasks.view_workload or tasks.manage.
- Workflow management requires tasks.manage_templates or tasks.manage.
- Workflow instantiation requires tasks.create and target scope permission; delegated owner also requires assignment authority.
- Direct authenticated writes to the workflow table are revoked; writes go through RPC validation.

## Security Advisor
Current global warnings remain for authenticated `SECURITY DEFINER` functions. Several are intentionally public RPC boundaries and contain explicit permission checks, but each still needs a production allowlist review. Do not blanket-revoke or blanket-convert to invoker because that can break internal private-schema permission checks or remove necessary authorization semantics.

Supabase remediation reference:
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

Leaked Password Protection remains disabled:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Performance Advisor
No new unindexed-FK issue was identified for the 6.7 workflow table. Current notices are primarily unused-index INFO. They should not be deleted from a low-volume QA database without production-like query statistics.

Reference:
https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Build and runtime
- Portable client: proven HTTP 200 on 4173.
- Standalone Platform Console: proven HTTP 200 on 4174.
- Required response headers verified: no-store, CSP, DENY, nosniff.
- Next build: not proven in this environment. `npm ci` is blocked by the internal package mirror returning 404 for `tslib-2.8.1.tgz`; `npm run build` therefore reports `next: not found`.

## Known operational residue
The company «جامعة النهضة (New Bani Suef, Beni Suef Governorate)» is operational but lacks a valid active Owner, so background Work scheduler deliberately skips it. This is safer than failing the whole cron job, but it is not an accepted scheduler state for that tenant.
