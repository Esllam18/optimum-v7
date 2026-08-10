# Optimum V7 — Feature Parity Tranche 16

## Scope
Tranche 16 restores deeper operational editing from the legacy Work/CDE experience without returning to the legacy visual shell.

## Work editor + Smart Assignment
- Work 360 now exposes a full editor rather than status-only execution controls.
- Editable fields include work type, priority, start/due/SLA dates, effort, skills, labels, visibility and ownership chain.
- Writes go through canonical `save_work_item` and send `expected_lock_version` for optimistic conflict protection.
- Smart Assignment uses the canonical server-side `work_assignment_candidates` scoring contract.
- Candidate cards surface score, utilization and skill-match count instead of browser-side guesswork.
- Owner/reviewer/approver selection remains backend permission and scope validated.
- Open-for-claim and private visibility constraints remain enforced by the backend contract.

## Calendar scheduling
- Calendar task events are actionable.
- Opening a task event fetches `work_task_detail` first, so rescheduling uses the latest lock version.
- Start/due rescheduling writes through `save_work_item`.
- Read-only calendar sources such as holidays, leave and milestones remain source-controlled.
- Every task event can jump directly into Work 360.

## Document 360 / CDE
- Document 360 now surfaces discipline, owner, review due date and last update.
- Direct navigation back to Project 360, Site 360 and the containing CDE folder is restored.
- `document_360.recent_activity` is rendered as a document activity timeline when audit access is available.
- Existing versions, linked work, linked engineering and delivery evidence remain intact.

## Database
No DDL. Tranche 16 consumes existing production RPC contracts: `save_work_item`, `work_assignment_candidates`, `work_task_detail`, and `document_360`.

## Remaining parity work
- Saved work views and advanced workload planning actions.
- Richer CDE metadata/bulk actions and deeper file lifecycle parity.
- Native CAD legacy tool parity and drawing revision lifecycle.
- People/Organization profile and governance editors.
