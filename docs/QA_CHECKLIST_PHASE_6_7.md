# QA Checklist — Optimum 6.7.0 Work Experience Excellence

## Automated gates
- [x] Baseline 6.6 tested before changes.
- [x] `npm test` full regression.
- [x] 227 actions / 54 forms / 83 RPC references contract audit.
- [x] Browser Core: client / organization / limited / mobile.
- [x] Browser Policy: adaptive policy / platform.
- [x] Browser Work: owner work flow / limited engineer.
- [x] Browser Excellence: cockpit / risk / dependency / capacity / Work360 / assignment / workflow / automation / calendar drag-drop.
- [x] 390×844 mobile no horizontal overflow and Work360 fits viewport.
- [x] Root/public/app/platform asset mirrors synchronized.

## Live Supabase gates
- [x] Owner Work Cockpit executes.
- [x] Engineer Work Cockpit executes with personal access only.
- [x] Owner Capacity executes.
- [x] Engineer Capacity is denied.
- [x] Engineer Workflow management is denied.
- [x] Workflow direct INSERT from authenticated is denied.
- [x] Workflow anon SELECT is denied.
- [x] Dependency graph executes under current scope.
- [x] Workflow 2-step instantiate succeeds in transaction + rollback.
- [x] Automation due-soon dry-run succeeds in transaction + rollback.
- [x] Scheduler smoke has zero failed companies.
- [x] Scheduler skips invalid company without stopping remaining companies.

## Manual acceptance recommended
1. Open Work and confirm Cockpit is useful as the default landing surface.
2. Open a real Work Item and inspect all 5 Work360 tabs.
3. Compare Smart Assignment strategies; ensure the reasoning matches real employee access/skills/load.
4. Open Capacity and inspect leave/holiday/overload cells for a real week.
5. Create A → B dependency and verify Risk/Dependency Center and direct navigation.
6. Build a 3-step workflow, instantiate it in a test project, verify task dates and dependencies, then clean up test data.
7. Build a due-soon automation with Dry Run before enabling it.
8. Drag a task in Calendar; verify it reschedules and another stale tab cannot overwrite newer changes.
9. Repeat core flow with a limited Engineer account and verify management controls are absent and Backend denies direct attempts.

## Production-only gates still open
- [ ] Successful `npm ci` in deployment environment.
- [ ] Successful `npm run build` with Next installed.
- [ ] SECURITY DEFINER allowlist review.
- [ ] Leaked Password Protection enabled.
- [ ] Staging destructive E2E + cleanup.
- [ ] Backup/restore drill and monitoring/alerts.
- [ ] Fix active Owner for جامعة النهضة before scheduler acceptance there.
