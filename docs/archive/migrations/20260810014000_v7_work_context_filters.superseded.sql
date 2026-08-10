-- Optimum V7 — Backward-compatible Work query context filters
-- Adds site/folder/document filtering through the existing p_filters JSONB contract.
-- No signature change; existing 6.x callers remain valid.

begin;

create or replace function public.work_task_query(
  p_company_id uuid,
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 60,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,60),200));
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_result jsonb;
begin
  if not app_private.has_company_permission(p_company_id,'tasks.view') then raise exception 'Permission denied'; end if;

  with filtered as materialized (
    select
      t.*,
      owner_profile.full_name owner_name,
      pr.name project_name,
      s.name site_name,
      app_private.task_risk_snapshot(t.id) risk,
      app_private.can_edit_task(t.id) can_edit,
      app_private.can_complete_task(t.id) can_complete,
      (t.open_unassigned and app_private.work_permission_for_row(t.company_id,'tasks.claim',t.project_id,t.site_id,t.folder_id,t.document_id)) can_claim,
      (select count(*) from public.task_comments c where c.task_id=t.id and c.deleted_at is null) comment_count,
      (select count(*) from public.task_attachments a where a.task_id=t.id and a.upload_state='ready') attachment_count,
      (select count(*) from public.task_dependencies d join public.tasks b on b.id=d.blocker_task_id where d.blocked_task_id=t.id and app_private.can_view_task(b.id)) blocker_count,
      (select count(*) from public.task_dependencies d join public.tasks b on b.id=d.blocked_task_id where d.blocker_task_id=t.id and app_private.can_view_task(b.id)) downstream_count
    from public.tasks t
    left join public.profiles owner_profile on owner_profile.id=t.owner_user_id
    left join public.projects pr on pr.id=t.project_id
    left join public.sites s on s.id=t.site_id
    where t.company_id=p_company_id
      and app_private.can_view_task(t.id)
      and (coalesce(p_filters->>'search','')='' or t.search_vector @@ plainto_tsquery('simple',p_filters->>'search') or t.title ilike '%'||(p_filters->>'search')||'%')
      and (coalesce(p_filters->>'status','') in ('','all') or t.status::text=p_filters->>'status' or (p_filters->>'status'='active' and t.status not in ('done','cancelled')))
      and (coalesce(p_filters->>'project_id','') in ('','all') or t.project_id=nullif(p_filters->>'project_id','')::uuid)
      and (coalesce(p_filters->>'site_id','') in ('','all') or t.site_id=nullif(p_filters->>'site_id','')::uuid)
      and (coalesce(p_filters->>'folder_id','') in ('','all') or t.folder_id=nullif(p_filters->>'folder_id','')::uuid)
      and (coalesce(p_filters->>'document_id','') in ('','all') or t.document_id=nullif(p_filters->>'document_id','')::uuid)
      and (coalesce(p_filters->>'task_type','') in ('','all') or t.task_type=p_filters->>'task_type')
      and (coalesce(p_filters->>'assignee_user_id','')='' or t.owner_user_id=nullif(p_filters->>'assignee_user_id','')::uuid or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=nullif(p_filters->>'assignee_user_id','')::uuid))
      and (coalesce(p_filters->>'due','') in ('','all')
        or (p_filters->>'due'='overdue' and t.status not in ('done','cancelled') and t.due_at<now())
        or (p_filters->>'due'='today' and t.status not in ('done','cancelled') and t.due_at::date=current_date)
        or (p_filters->>'due'='week' and t.status not in ('done','cancelled') and t.due_at>=date_trunc('week',now()) and t.due_at<date_trunc('week',now())+interval '7 days')
        or (p_filters->>'due'='none' and t.due_at is null))
      and (coalesce(p_filters->>'scope','') not in ('my','open','completed')
        or (p_filters->>'scope'='my' and (t.owner_user_id=auth.uid() or t.created_by=auth.uid() or t.claimed_by=auth.uid() or t.reviewer_user_id=auth.uid() or t.approver_user_id=auth.uid() or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=auth.uid())))
        or (p_filters->>'scope'='open' and t.open_unassigned and t.status not in ('done','cancelled'))
        or (p_filters->>'scope'='completed' and t.status in ('done','cancelled')))
  ), scoped as materialized (
    select * from filtered where (coalesce(p_filters->>'risk','') in ('','all') or risk->>'level'=p_filters->>'risk')
  ), page as (
    select * from scoped
    order by case when status in ('done','cancelled') then 1 else 0 end,
      coalesce((risk->>'score')::int,0) desc,
      due_at asc nulls last,
      created_at desc
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
    'total',(select count(*) from scoped),
    'offset',v_offset,
    'limit',v_limit,
    'has_more',(select count(*) from scoped)>v_offset+v_limit
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.work_task_query(uuid,jsonb,integer,integer) from public,anon;
grant execute on function public.work_task_query(uuid,jsonb,integer,integer) to authenticated;

commit;
