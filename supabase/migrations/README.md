# Supabase migrations

The SQL files in this folder are the source-controlled migration history used by the Optimum project through Phase 4.

The connected remote project already has the corresponding migrations applied. **Do not run them again against the same project.** They are included for review, reproducibility, and provisioning a fresh environment later.

Phase 4 migrations:

- `20260804111500_phase4_cad_engineering.sql`
- `20260804114000_phase4_performance_hardening.sql`
- `20260804115500_phase4_files_workspace_integration.sql`
- `20260804120500_phase4_document_link_guard.sql`

The canonical schema and workflow notes are in `docs/DATABASE_BIBLE.md` and `docs/TECHNICAL_ARCHITECTURE.md`.
