# Superseded V7 migration drafts

Files in this directory are historical design/profiling artifacts and are intentionally **not** part of the active Supabase migration chain.

`20260810014000_v7_work_context_filters.superseded.sql` added contextual Work filters during development. Before Production application, those filters were folded into the optimized canonical migration `supabase/migrations/20260809225541_v7_work_read_performance.sql`. Keeping the draft inside `supabase/migrations` would create migration-history drift and risk duplicate application.
