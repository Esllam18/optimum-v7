-- Optimum 6.8.0 — Project & Document Control OS performance release cleanup
-- Covers new foreign-key access paths and makes global blueprint codes unique.

begin;

create index if not exists documents_approved_by_idx
  on public.documents(approved_by)
  where approved_by is not null;

create index if not exists project_blueprints_created_by_idx
  on public.project_blueprints(created_by)
  where created_by is not null;

create index if not exists project_blueprints_folder_template_idx
  on public.project_blueprints(folder_template_id)
  where folder_template_id is not null;

create unique index if not exists project_blueprints_global_code_unique
  on public.project_blueprints(lower(code))
  where company_id is null;

commit;
