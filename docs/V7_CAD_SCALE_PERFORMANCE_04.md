# Optimum V7 — Native CAD & Scale Performance Closure 04

## Scope

This closure covers the first native V7 CAD workspace and rollback-safe scale profiling/hardening of the main Work, Project 360 and Site 360 read paths against the live Optimum Supabase schema.

## Native CAD workspace

V7 now has an isolated full-screen CAD workspace under the Engineering module instead of using the legacy application shell as the primary drawing experience.

The V7 workspace deliberately reuses the proven 6.9 engineering core for:

- snapshot normalization;
- SVG rendering;
- takeoff/BOQ calculation;
- engineering validation;
- client-to-SVG coordinate mapping;
- compatible DXF export.

The V7 layer adds:

- route-lazy loading of the heavy CAD core;
- full-screen canvas-focused shell;
- collapsible component palette and contextual inspector;
- native node placement, selection, drag and delete;
- native two-node route creation;
- node/route property editing;
- live validation and live takeoff;
- CSV takeoff export;
- SVG and DXF output;
- Ctrl+S and explicit save;
- idle-coalesced autosave;
- local recovery storage;
- read-only behavior for non-draft/non-editable revisions;
- frame-logo migration from inline Base64 data to private engineering assets.

## Engineering save root cause

The active draft tested on Production contains only ~2.7 KB of drawing geometry but ~8.38 MB in `sheet_settings`, caused by four embedded Base64 frame logos. This explains the previously erratic draft-save latency and the disproportionate TOAST footprint of `engineering_revisions`.

The applied V7 save fast path now:

- explicitly enforces drawing resource scope before every save, including no-op saves;
- preserves optimistic locking;
- returns without rewriting the revision for a true no-op;
- avoids BOQ row rewrites when the BOQ snapshot is unchanged;
- uses set-based BOQ synchronization when it is changed;
- only touches the drawing row when a real correction/update is required.

On the existing heavy 8.38 MB draft, a no-op now correctly returns `changed=false` with a stable lock. Timing still varies because PostgreSQL must read/compare the legacy 8.38 MB JSONB payload. The remaining latency is expected to fall after the first real V7 browser save externalizes the logos and persists compact asset references.

A rollback scope test also confirmed that an Engineer temporarily scoped away from the drawing receives `Permission denied` even for a no-op save.

## Large-data rollback profiling

All synthetic fixtures were inserted inside transactions and rolled back. No synthetic tasks/documents/scope rules remain in Production.

### Before V7 read-model optimization

| Path | Synthetic load | Measured DB time |
|---|---:|---:|
| Work task query | +300 tasks in one project | ~1.92 s |
| Project 360 | +300 tasks + 3,000 documents | ~1.09 s |
| Site 360 | +300 tasks + 3,000 documents | ~771 ms |
| CDE folder snapshot | +3,000 documents in one folder | ~182 ms |
| Document search | +3,000 documents | ~120 ms |

The dominant bottleneck was not missing basic indexes. Work and 360 read models repeatedly executed permission, visibility, risk and capability functions per row before pagination.

### Applied V7 read-model optimization

A private `user_permission_is_unscoped()` helper determines once whether the current user has company-wide access for a permission or needs the generic scoped path.

For unscoped authorized users, Work/Project/Site read models now use set-based/indexed aggregation. Restricted users continue through the existing resource-scope checks.

| Path | Same synthetic load | After optimization |
|---|---:|---:|
| Work task query | 301 visible tasks | avg **15.97 ms** (13.35–25.90 ms) |
| Project 360 | 301 open tasks + 3,003 documents | avg **8.55 ms** (5.31–20.64 ms) |
| Site 360 | 300 open tasks + 3,000 documents | avg **15.12 ms** (11.14–30.01 ms) |

This is over two orders of magnitude faster for the two worst paths in the measured scenario.

## Correctness/security checks

- Document-context Work filter now returns only the linked task (Task #38 in the live smoke case) and retains `can_edit`, `can_complete`, `can_claim` fields.
- A rollback-scoped Manager produced the same visible Work task set as the legacy `can_view_task` logic (1 vs 1).
- A rollback-scoped Manager limited to Site S001 saw exactly one drawing in Project 360, matching direct resource-permission calculation.
- A Manager scoped away from S001 drawings saw zero drawings in Site 360, matching direct resource-permission calculation.
- No temporary access-scope rules, synthetic load tasks or synthetic load documents persisted after profiling.

## Production migrations applied in this closure

- `v7_work_read_performance` — production migration version `20260809225541`.
- `v7_project360_read_performance` — version `20260809225906`.
- `v7_engineering_draft_fast_path` — version `20260809230046`.
- `v7_site360_read_performance` — version `20260809230254`.

The older local context-only Work migration is superseded and was not applied separately.

## Validation

- Production-like CAD SVG/DXF sample generation passes.
- Full Optimum 6.9 regression suite passes.
- V7 contracts pass, including native CAD, performance, resource-scope, lifecycle, CDE and Claim controls.
- `npm run test:release` passes after all code and migration changes.
- Production Next build remains unverified because the local execution environment still has an incomplete Next/React dependency installation; no build success is claimed.

## Next engineering priorities

1. Browser-run the native V7 CAD workspace after restoring the Next dependency environment, including responsive and real pointer/drag QA.
2. Complete the first real browser save that externalizes legacy frame logos and verify the post-compaction draft size/save latency.
3. Continue load profiling for Member/Organization, Dashboard and Claim read models at realistic tenant volumes.
4. Add repeatable performance budgets into automated staging tests rather than relying only on ad-hoc profiling.
5. Continue SECURITY DEFINER allowlist/threat review and production auth/backup/monitoring gates.
