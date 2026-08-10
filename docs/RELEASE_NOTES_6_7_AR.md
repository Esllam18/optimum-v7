# Release Notes — Optimum 6.7.0

**Release:** Work Experience Excellence

6.7 turns the Phase 6 Work backend into a daily Work Command Center while preserving the server-enforced access model.

### New
- Work Cockpit with personal focus and manager pulse.
- Actionable Risk Center.
- Capacity heatmap/planner.
- Dependency map with impact scoring.
- Work Item 360 five-tab experience.
- Smart Assignment 2.0 with Balanced / Most Skilled / Least Loaded explanations.
- Visual Workflow Template builder + server-side instantiate.
- Visual Automation Builder (WHEN / IF / THEN).
- `task.due_soon` automation trigger and scheduler pass.
- richer automation recipients and conditions.
- Saved Work Views.
- Calendar drag/drop rescheduling through atomic Work RPC + lock version.
- responsive Work UI for 390px mobile.

### Fixed during live verification
- `task.due_soon` CHECK constraint mismatch.
- accidental anon SELECT privilege on workflow template table.

### Verified
- Full regression PASS.
- Contract audit: 227 actions / 54 forms / 83 RPC references.
- Browser Core / Policy / Work / Excellence / Mobile PASS.
- Live Cockpit / Capacity / Dependency / Workflow / Automation / permission smoke PASS.
- Portable client and Platform Console HTTP 200 with security headers.

### Not claimed as closed
- Next production build in this environment.
- Global SECURITY DEFINER production allowlist review.
- Leaked Password Protection.
- Scheduler for جامعة النهضة until a valid active Owner exists.
