-- Optimum 6.1 — Work Query, Detail, optimistic concurrency and dependency-aware status flow.

create or replace function app_private.task_has_unfinished_blockers(p_task_id uuid)
returns boolean language sql stable security definer set search_path='public','pg_temp' as $$
  select exists(
    select 1 from public.task_dependencies d
    join public.tasks b on b.id=d.blocker_task_id
    where d.blocked_task_id=p_task_id and b.status not in ('done','cancelled')
  );
$$;

create or replace function app_private.task_risk_snapshot(p_task_id uuid)
returns jsonb language sql stable security definer set search_path='public','app_private','pg_temp' as $$
with t as (select * from public.tasks where id=p_task_id), x as (
  select t.*,
    (status not in ('done','cancelled') and due_at is not null and due_at<now()) overdue,
    (status='blocked') blocked,
    app_private.task_has_unfinished_blockers(id) dependency_blocked,
    (owner_user_id is null) no_owner,
    coalesce((select count(*) from public.task_dependencies d join public.tasks n on n.id=d.blocked_task_id where d.blocker_task_id=t.id and n.status not in ('done','cancelled') and app_private.can_view_task(n.id)),0) downstream
  from t
), scored as (
  select x.*,least(100,(case when overdue then 35 else 0 end)+(case when blocked then 25 else 0 end)+(case when dependency_blocked then 20 else 0 end)+(case when no_owner then 20 else 0 end)+least(downstream*5,20))::integer score from x
)
select jsonb_build_object(
  'score',score,
  'level',case when score>=85 then 'critical' when score>=60 then 'high' when score>=25 then 'medium' else 'low' end,
  'reasons',jsonb_strip_nulls(jsonb_build_object('overdue',case when overdue then true end,'blocked',case when blocked then true end,'dependency_blocked',case when dependency_blocked then true end,'no_owner',case when no_owner then true end,'downstream',case when downstream>0 then downstream end))
) from scored;
$$;

create or replace function public.work_runtime_revision(p_company_id uuid)
returns table(revision bigint,updated_at timestamptz)
language sql stable security definer set search_path='public','app_private','pg_temp' as $$
  select coalesce(w.revision,0),coalesce(w.updated_at,to_timestamp(0))
  from (select 1) x left join public.work_runtime_versions w on w.company_id=p_company_id
  where app_private.is_company_member(p_company_id) or app_private.is_platform_admin();
$$;

create or replace function public.save_task_dependency(p_blocker_task_id uuid,p_blocked_task_id uuid)
returns uuid language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare v_company uuid;v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select company_id into v_company from public.tasks where id=p_blocked_task_id;
  if v_company is null or not app_private.can_edit_task(p_blocked_task_id) then raise exception 'Permission denied'; end if;
  if not app_private.can_view_task(p_blocker_task_id) then raise exception 'You cannot link a dependency you cannot view'; end if;
  insert into public.task_dependencies(company_id,blocker_task_id,blocked_task_id,created_by)
  values(v_company,p_blocker_task_id,p_blocked_task_id,auth.uid())
  on conflict(blocker_task_id,blocked_task_id) do update set blocker_task_id=excluded.blocker_task_id
  returning id into v_id;
  perform app_private.bump_work_runtime(v_company);
  return v_id;
end; $$;

create or replace function public.delete_task_dependency(p_dependency_id uuid)
returns void language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare v_row public.task_dependencies%rowtype;
begin
  select * into v_row from public.task_dependencies where id=p_dependency_id;
  if not found or not app_private.can_edit_task(v_row.blocked_task_id) then raise exception 'Permission denied'; end if;
  delete from public.task_dependencies where id=p_dependency_id;
  perform app_private.bump_work_runtime(v_row.company_id);
end; $$;

create or replace function public.work_task_query(p_company_id uuid,p_filters jsonb default '{}'::jsonb,p_limit integer default 60,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp' as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,60),200));v_offset integer:=greatest(coalesce(p_offset,0),0);v_result jsonb;
begin
 if not app_private.has_company_permission(p_company_id,'tasks.view') then raise exception 'Permission denied'; end if;
 with filtered as (
  select t.*,p.full_name owner_name,pr.name project_name,app_private.task_risk_snapshot(t.id) risk,
   (select count(*) from public.task_comments c where c.task_id=t.id and c.deleted_at is null) comment_count,
   (select count(*) from public.task_attachments a where a.task_id=t.id and a.upload_state='ready') attachment_count,
   (select count(*) from public.task_dependencies d join public.tasks b on b.id=d.blocker_task_id where d.blocked_task_id=t.id and app_private.can_view_task(b.id)) blocker_count,
   (select count(*) from public.task_dependencies d join public.tasks b on b.id=d.blocked_task_id where d.blocker_task_id=t.id and app_private.can_view_task(b.id)) downstream_count
  from public.tasks t left join public.profiles p on p.id=t.owner_user_id left join public.projects pr on pr.id=t.project_id
  where t.company_id=p_company_id and app_private.can_view_task(t.id)
   and (coalesce(p_filters->>'search','')='' or t.search_vector @@ plainto_tsquery('simple',p_filters->>'search') or t.title ilike '%'||(p_filters->>'search')||'%')
   and (coalesce(p_filters->>'status','') in ('','all') or t.status::text=p_filters->>'status' or (p_filters->>'status'='active' and t.status not in ('done','cancelled')))
   and (coalesce(p_filters->>'project_id','') in ('','all') or t.project_id=nullif(p_filters->>'project_id','')::uuid)
   and (coalesce(p_filters->>'task_type','') in ('','all') or t.task_type=p_filters->>'task_type')
   and (coalesce(p_filters->>'assignee_user_id','')='' or t.owner_user_id=nullif(p_filters->>'assignee_user_id','')::uuid or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=nullif(p_filters->>'assignee_user_id','')::uuid))
   and (coalesce(p_filters->>'due','') in ('','all') or (p_filters->>'due'='overdue' and t.status not in ('done','cancelled') and t.due_at<now()) or (p_filters->>'due'='today' and t.status not in ('done','cancelled') and t.due_at::date=current_date) or (p_filters->>'due'='week' and t.status not in ('done','cancelled') and t.due_at>=date_trunc('week',now()) and t.due_at<date_trunc('week',now())+interval '7 days') or (p_filters->>'due'='none' and t.due_at is null))
   and (coalesce(p_filters->>'scope','') not in ('my','open','completed') or (p_filters->>'scope'='my' and (t.owner_user_id=auth.uid() or t.created_by=auth.uid() or t.claimed_by=auth.uid() or t.reviewer_user_id=auth.uid() or t.approver_user_id=auth.uid() or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=auth.uid()))) or (p_filters->>'scope'='open' and t.open_unassigned and t.status not in ('done','cancelled')) or (p_filters->>'scope'='completed' and t.status in ('done','cancelled')))
 ), page as (
   select * from filtered where (coalesce(p_filters->>'risk','') in ('','all') or risk->>'level'=p_filters->>'risk')
   order by case when status in ('done','cancelled') then 1 else 0 end,coalesce((risk->>'score')::int,0) desc,due_at asc nulls last,created_at desc
   limit v_limit offset v_offset
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from filtered where (coalesce(p_filters->>'risk','') in ('','all') or risk->>'level'=p_filters->>'risk')),'offset',v_offset,'limit',v_limit,'has_more',(select count(*) from filtered where (coalesce(p_filters->>'risk','') in ('','all') or risk->>'level'=p_filters->>'risk'))>v_offset+v_limit) into v_result;
 return v_result;
end; $$;

create or replace function public.work_task_detail(p_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp' as $$
declare v_task public.tasks%rowtype;v_result jsonb;
begin
  select * into v_task from public.tasks where id=p_task_id;
  if not found or not app_private.can_view_task(p_task_id) then raise exception 'Permission denied'; end if;
  select jsonb_build_object(
    'task',to_jsonb(v_task),'risk',app_private.task_risk_snapshot(p_task_id),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'user_id',a.user_id,'role_id',a.role_id,'assigned_by',a.assigned_by,'name',p.full_name,'role_name_ar',r.name_ar,'role_name_en',r.name_en)) from public.task_assignments a left join public.profiles p on p.id=a.user_id left join public.roles r on r.id=a.role_id where a.task_id=p_task_id),'[]'::jsonb),
    'watchers',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'user_id',w.user_id,'name',p.full_name)) from public.task_watchers w join public.profiles p on p.id=w.user_id where w.task_id=p_task_id),'[]'::jsonb),
    'checklist',coalesce((select jsonb_agg(to_jsonb(c) order by c.position,c.created_at) from public.task_checklist_items c where c.task_id=p_task_id),'[]'::jsonb),
    'comments',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('author_name',p.full_name) order by c.created_at) from public.task_comments c left join public.profiles p on p.id=c.author_id where c.task_id=p_task_id and c.deleted_at is null),'[]'::jsonb),
    'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.task_attachments a where a.task_id=p_task_id and a.upload_state='ready'),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (select ev.*,p.full_name actor_name from public.task_events ev left join public.profiles p on p.id=ev.actor_id where ev.task_id=p_task_id order by ev.created_at desc limit 200) q),'[]'::jsonb),
    'blockers',coalesce((select jsonb_agg(jsonb_build_object('dependency_id',d.id,'id',b.id,'task_number',b.task_number,'title',b.title,'status',b.status,'due_at',b.due_at)) from public.task_dependencies d join public.tasks b on b.id=d.blocker_task_id where d.blocked_task_id=p_task_id and app_private.can_view_task(b.id)),'[]'::jsonb),
    'downstream',coalesce((select jsonb_agg(jsonb_build_object('dependency_id',d.id,'id',b.id,'task_number',b.task_number,'title',b.title,'status',b.status,'due_at',b.due_at)) from public.task_dependencies d join public.tasks b on b.id=d.blocked_task_id where d.blocker_task_id=p_task_id and app_private.can_view_task(b.id)),'[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

create or replace function public.set_task_status(p_task_id uuid,p_status public.task_status,p_completion_note text default null,p_blocked_reason text default null,p_progress integer default null)
returns void language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare v_task public.tasks%rowtype;v_old public.task_status;
begin
  select * into v_task from public.tasks where id=p_task_id for update;
  if not found or not app_private.can_complete_task(p_task_id) then raise exception 'Permission denied';end if;
  if p_status in ('in_progress','done') and app_private.task_has_unfinished_blockers(p_task_id) then raise exception 'Task is blocked by an unfinished dependency';end if;
  if p_status='blocked' and nullif(trim(coalesce(p_blocked_reason,'')),'') is null then raise exception 'Blocked status requires a reason';end if;
  if p_status='done' and v_task.task_type='approval' then
    if not (app_private.has_company_permission(v_task.company_id,'tasks.approve') or app_private.has_company_permission(v_task.company_id,'tasks.manage')) then raise exception 'Approval permission required';end if;
    if v_task.approver_user_id is not null and v_task.approver_user_id<>auth.uid() and not app_private.has_company_permission(v_task.company_id,'tasks.manage') then raise exception 'Only the designated approver can complete this approval';end if;
  end if;
  v_old:=v_task.status;
  update public.tasks set status=p_status,progress=case when p_status='done' then 100 when p_progress is not null then least(greatest(p_progress,0),100) when p_status='todo' then 0 else progress end,blocked_reason=case when p_status='blocked' then nullif(trim(p_blocked_reason),'') else null end,completion_note=case when p_status='done' then nullif(trim(p_completion_note),'') else completion_note end,completed_at=case when p_status='done' then now() else null end,completed_by=case when p_status='done' then auth.uid() else null end,cancelled_at=case when p_status='cancelled' then now() else null end,updated_by=auth.uid() where id=p_task_id;
  insert into public.task_events(company_id,task_id,actor_id,event_type,from_status,to_status,metadata) values(v_task.company_id,p_task_id,auth.uid(),'task.status_changed',v_old,p_status,jsonb_build_object('completion_note',p_completion_note,'blocked_reason',p_blocked_reason));
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(v_task.company_id,auth.uid(),'task.status_changed','task',p_task_id,jsonb_build_object('from',v_old,'to',p_status));
  perform app_private.bump_work_runtime(v_task.company_id);
end; $$;

revoke all on function public.work_runtime_revision(uuid) from public,anon;
revoke all on function public.save_task_dependency(uuid,uuid) from public,anon;
revoke all on function public.delete_task_dependency(uuid) from public,anon;
revoke all on function public.work_task_query(uuid,jsonb,integer,integer) from public,anon;
revoke all on function public.work_task_detail(uuid) from public,anon;
revoke all on function public.set_task_status(uuid,public.task_status,text,text,integer) from public,anon;
grant execute on function public.work_runtime_revision(uuid) to authenticated;
grant execute on function public.save_task_dependency(uuid,uuid) to authenticated;
grant execute on function public.delete_task_dependency(uuid) to authenticated;
grant execute on function public.work_task_query(uuid,jsonb,integer,integer) to authenticated;
grant execute on function public.work_task_detail(uuid) to authenticated;
grant execute on function public.set_task_status(uuid,public.task_status,text,text,integer) to authenticated;
