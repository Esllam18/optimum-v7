-- Phase 5.8 Organization OS: saved views RLS/index cleanup.
-- Preserve the same ownership + company-membership semantics while avoiding
-- per-row auth.uid() re-evaluation and duplicate partial unique indexes.

drop policy if exists workspace_saved_views_select on public.workspace_saved_views;
drop policy if exists workspace_saved_views_insert on public.workspace_saved_views;
drop policy if exists workspace_saved_views_update on public.workspace_saved_views;
drop policy if exists workspace_saved_views_delete on public.workspace_saved_views;

create policy workspace_saved_views_select
on public.workspace_saved_views
for select
to authenticated
using (
  user_id = (select auth.uid())
  and app_private.is_company_member(company_id)
);

create policy workspace_saved_views_insert
on public.workspace_saved_views
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and app_private.is_company_member(company_id)
);

create policy workspace_saved_views_update
on public.workspace_saved_views
for update
to authenticated
using (
  user_id = (select auth.uid())
  and app_private.is_company_member(company_id)
)
with check (
  user_id = (select auth.uid())
  and app_private.is_company_member(company_id)
);

create policy workspace_saved_views_delete
on public.workspace_saved_views
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and app_private.is_company_member(company_id)
);

-- A prior 5.6 attempt left an identical partial unique index behind.
-- 5.8 keeps workspace_saved_views_default_idx as the canonical index.
drop index if exists public.workspace_saved_views_one_default_idx;
