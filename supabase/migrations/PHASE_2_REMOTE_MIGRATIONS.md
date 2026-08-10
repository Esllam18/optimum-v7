# Phase 2 migration reconstruction status

The previously remote-only Files migrations have now been reconstructed and committed as canonical repository migrations:

- `20260803211107_phase2_files_schema.sql`
- `20260803211211_phase2_files_workflows.sql`

They define the baseline Files Workspace schema/workflows required by the later hardening and Phase 6.8 migrations. Later migrations remain authoritative for the current hardened behavior.

The following historical Phase 2 remote migrations are still represented by later repository behavior rather than verbatim historical SQL:

- `20260803210554_phase2_platform_control`
- `20260803212223_phase2_platform_metrics_storage`
- `20260803212452_phase2_performance_hardening`

Do not replay historical remote migrations against the existing production project. For a fresh environment, use the repository migration chain in timestamp order and verify it with the release fresh-schema test.
