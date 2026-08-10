# Optimum V7 Rebuild — Checkpoint 01

Date: 2026-08-09

## What changed

A parallel `/v7` application has been introduced without replacing the 6.9 runtime. The goal of this checkpoint is to prove the new application architecture and data-loading model before any destructive migration.

### Preserved

- Existing Supabase project, RLS and RPC/domain contracts.
- Existing 6.9 session storage (`optimum.session.v2.client`) so V7 and 6.9 can coexist during migration.
- Existing CAD/engineering engine; V7 currently launches the 6.9 engine rather than rewriting CAD business logic blindly.
- Project 360, Work RPCs, CDE snapshots, claims/cabinets, roles and access contracts.

### New application layer

- React/Next V7 shell under `/v7`.
- Minimal workspace bootstrap instead of the legacy `loadCompanyData()` full-company fan-out.
- Per-route loading for Projects, Work, Documents, Engineering, People, Delivery and Control.
- Request cache, in-flight request deduplication, refresh-token mutex, cancellation and browser-side query timing metrics.
- Centralized signed identity asset caching/failure backoff.
- Global command/search surface.
- Premium responsive UI system with dark/light variables and Arabic RTL / English LTR support.

## Important performance changes in this checkpoint

### Legacy behavior avoided

The legacy files loader can run a `document_picker_query` for up to 30 projects in one load and request up to 100 documents for each project. V7 does not do this. It loads one selected project through `file_workspace_snapshot` and uses `document_search_v2` only when the user types a search.

The legacy company bootstrap also loads roles, permissions, members, invitations, branding, all project/site context, activity, Organization OS, Files, Notifications, Work and Engineering from one company load. V7 bootstraps only identity, active memberships, companies, branding and `workspace_runtime_policy`. Module data is loaded after navigation.

### Query telemetry

V7 records recent API timings in memory at `window.__OPTIMUM_V7_METRICS__`. The sidebar displays a small rolling latency indicator. This is intentionally lightweight; production telemetry can later be moved server-side.

## Production database status

No production DDL or destructive database changes were applied in this checkpoint.

Known database performance targets remain:

- `save_engineering_draft` ~4s mean: P0 investigation.
- `project/site/work` aggregate RPCs: eliminate repeated work and unnecessary repeated calls.
- Authentication/runtime polling race: centralize invalidation and refresh.
- Identity asset signed URL 400s: verify stored object paths and object existence; V7 gracefully falls back instead of issuing repeated failures.

## Next implementation slice

1. Compile and browser-validate V7.
2. Fix any contract mismatches against live Supabase payloads.
3. Build Document 360 and Task detail as true contextual workspaces.
4. Build Project/Site/Cabinet context navigation.
5. Start the CAD shell refactor while preserving the underlying drawing/takeoff logic.
6. Profile and rewrite `save_engineering_draft` on a safe migration path after its exact function internals are reviewed.
