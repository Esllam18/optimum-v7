create index if not exists task_assignments_assigned_by_idx on public.task_assignments(assigned_by);
create index if not exists task_assignments_role_idx on public.task_assignments(role_id) where role_id is not null;
create index if not exists task_assignments_user_idx on public.task_assignments(user_id) where user_id is not null;
create index if not exists task_attachments_comment_idx on public.task_attachments(comment_id) where comment_id is not null;
create index if not exists task_attachments_company_idx on public.task_attachments(company_id);
create index if not exists task_attachments_uploaded_by_idx on public.task_attachments(uploaded_by);
create index if not exists task_checklist_company_idx on public.task_checklist_items(company_id);
create index if not exists task_checklist_completed_by_idx on public.task_checklist_items(completed_by) where completed_by is not null;
create index if not exists task_checklist_created_by_idx on public.task_checklist_items(created_by);
create index if not exists task_comments_author_idx on public.task_comments(author_id);
create index if not exists task_comments_company_idx on public.task_comments(company_id);
create index if not exists task_events_actor_idx on public.task_events(actor_id) where actor_id is not null;
create index if not exists task_events_company_idx on public.task_events(company_id);
create index if not exists task_series_created_by_idx on public.task_series(created_by);
create index if not exists task_series_document_idx on public.task_series(document_id) where document_id is not null;
create index if not exists task_series_folder_idx on public.task_series(folder_id) where folder_id is not null;
create index if not exists task_series_project_idx on public.task_series(project_id) where project_id is not null;
create index if not exists task_series_site_idx on public.task_series(site_id) where site_id is not null;
create index if not exists task_series_assignments_assigned_by_idx on public.task_series_assignments(assigned_by);
create index if not exists task_series_assignments_company_idx on public.task_series_assignments(company_id);
create index if not exists task_series_assignments_role_idx on public.task_series_assignments(role_id) where role_id is not null;
create index if not exists task_series_assignments_user_idx on public.task_series_assignments(user_id) where user_id is not null;
create index if not exists tasks_completed_by_idx on public.tasks(completed_by) where completed_by is not null;
create index if not exists tasks_updated_by_idx on public.tasks(updated_by) where updated_by is not null;

drop policy if exists task_series_select on public.task_series;
create policy task_series_select on public.task_series for select to authenticated using(
  app_private.has_company_permission(company_id,'tasks.view')
  and (visibility='company' or created_by=(select auth.uid()))
);

drop policy if exists task_series_assignments_select on public.task_series_assignments;
create policy task_series_assignments_select on public.task_series_assignments for select to authenticated using(
  exists(
    select 1 from public.task_series s
    where s.id=series_id
      and app_private.has_company_permission(s.company_id,'tasks.view')
      and (s.visibility='company' or s.created_by=(select auth.uid()))
  )
);
