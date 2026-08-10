-- Optimum V7 — dashboard metric aggregation without per-row permission calls for unscoped managers.
create or replace function public.work_dashboard_metrics(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_view_all boolean:=false;
  v_unscoped_view boolean:=false;
  v_result jsonb;
begin
  if v_uid is null or not app_private.has_company_permission(p_company_id,'tasks.view') then
    raise exception 'Permission denied';
  end if;
  v_view_all:=app_private.has_company_permission(p_company_id,'tasks.view_all');
  v_unscoped_view:=v_view_all and app_private.user_permission_is_unscoped(v_uid,p_company_id,'tasks.view');

  with visible as materialized (
    select t.status,t.due_at,t.completed_at
    from public.tasks t
    where t.company_id=p_company_id
      and (v_unscoped_view or app_private.can_view_task(t.id))
  )
  select jsonb_build_object(
    'my_todo',count(*) filter(where status in('todo','in_progress','blocked')),
    'due_today',count(*) filter(where status not in('done','cancelled') and due_at::date=current_date),
    'overdue',count(*) filter(where status not in('done','cancelled') and due_at<now()),
    'blocked',count(*) filter(where status='blocked'),
    'completed_this_week',count(*) filter(where status='done' and completed_at>=date_trunc('week',now())),
    -- Scoped users must never receive a count for work they cannot view.
    'company_open',count(*) filter(where v_view_all and status not in('done','cancelled'))
  ) into v_result
  from visible;
  return v_result;
end;
$$;

revoke all on function public.work_dashboard_metrics(uuid) from public,anon;
grant execute on function public.work_dashboard_metrics(uuid) to authenticated;
comment on function public.work_dashboard_metrics(uuid) is
'V7 dashboard metric read model. Uses a set-wise fast path for unscoped task viewers and falls back to row-level task visibility for scoped users.';
