-- Optimum V7 — Work read-path performance + full context filters.
-- Backward-compatible public.work_task_query signature.
-- Main optimization: avoid repeating expensive permission/risk/capability checks
-- for every row when the current user has company-wide unscoped Work access.

create or replace function app_private.user_permission_is_unscoped(
  p_user_id uuid,
  p_company_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path='public','app_private','pg_temp'
as $$
with membership as (
  select m.id,m.role_id
  from public.company_memberships m
  where m.company_id=p_company_id
    and m.user_id=p_user_id
    and m.status='active'
    and (m.access_starts_at is null or m.access_starts_at<=now())
    and (m.access_ends_at is null or m.access_ends_at>now())
), subjects as (
  select 'membership'::text subject_type,id subject_id from membership
  union all select 'role',role_id from membership
  union all
  select 'addon',ma.addon_id
  from membership m
  join public.member_role_addons ma on ma.membership_id=m.id
    and (ma.expires_at is null or ma.expires_at>now())
)
select
  exists(select 1 from public.platform_admins pa where pa.user_id=p_user_id and pa.is_active)
  or (
    app_private.user_has_company_permission(p_user_id,p_company_id,p_permission_key)
    and not exists(
      select 1
      from public.access_scope_rules r
      join subjects s on s.subject_type=r.subject_type and s.subject_id=r.subject_id
      where r.company_id=p_company_id
        and (r.permission_key is null or r.permission_key=p_permission_key)
    )
  );
$$;

revoke all on function app_private.user_permission_is_unscoped(uuid,uuid,text) from public,anon,authenticated;

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
  v_uid uuid:=auth.uid();
  v_limit integer:=greatest(1,least(coalesce(p_limit,60),200));
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_result jsonb;
  v_view_all boolean:=false;
  v_manage boolean:=false;
  v_claim boolean:=false;
  v_unscoped_view_all boolean:=false;
  v_unscoped_manage boolean:=false;
  v_unscoped_claim boolean:=false;
begin
  if v_uid is null or not app_private.has_company_permission(p_company_id,'tasks.view') then
    raise exception 'Permission denied';
  end if;

  v_view_all:=app_private.has_company_permission(p_company_id,'tasks.view_all');
  v_manage:=app_private.has_company_permission(p_company_id,'tasks.manage');
  v_claim:=app_private.has_company_permission(p_company_id,'tasks.claim');
  v_unscoped_view_all:=v_view_all and app_private.user_permission_is_unscoped(v_uid,p_company_id,'tasks.view');
  v_unscoped_manage:=v_manage and app_private.user_permission_is_unscoped(v_uid,p_company_id,'tasks.manage');
  v_unscoped_claim:=v_claim and app_private.user_permission_is_unscoped(v_uid,p_company_id,'tasks.claim');

  with base as materialized (
    select t.*
    from public.tasks t
    where t.company_id=p_company_id
      and (
        v_unscoped_view_all
        or app_private.can_view_task(t.id)
      )
      and (coalesce(p_filters->>'search','')='' or t.search_vector @@ plainto_tsquery('simple',p_filters->>'search') or t.title ilike '%'||(p_filters->>'search')||'%')
      and (coalesce(p_filters->>'status','') in ('','all') or t.status::text=p_filters->>'status' or (p_filters->>'status'='active' and t.status not in ('done','cancelled')))
      and (coalesce(p_filters->>'project_id','') in ('','all') or t.project_id=nullif(p_filters->>'project_id','')::uuid)
      and (coalesce(p_filters->>'site_id','') in ('','all') or t.site_id=nullif(p_filters->>'site_id','')::uuid)
      and (coalesce(p_filters->>'folder_id','') in ('','all') or t.folder_id=nullif(p_filters->>'folder_id','')::uuid)
      and (coalesce(p_filters->>'document_id','') in ('','all') or t.document_id=nullif(p_filters->>'document_id','')::uuid)
      and (coalesce(p_filters->>'task_type','') in ('','all') or t.task_type=p_filters->>'task_type')
      and (
        coalesce(p_filters->>'assignee_user_id','')=''
        or t.owner_user_id=nullif(p_filters->>'assignee_user_id','')::uuid
        or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=nullif(p_filters->>'assignee_user_id','')::uuid)
      )
      and (
        coalesce(p_filters->>'due','') in ('','all')
        or (p_filters->>'due'='overdue' and t.status not in ('done','cancelled') and t.due_at<now())
        or (p_filters->>'due'='today' and t.status not in ('done','cancelled') and t.due_at::date=current_date)
        or (p_filters->>'due'='week' and t.status not in ('done','cancelled') and t.due_at>=date_trunc('week',now()) and t.due_at<date_trunc('week',now())+interval '7 days')
        or (p_filters->>'due'='none' and t.due_at is null)
      )
      and (
        coalesce(p_filters->>'scope','') not in ('my','open','completed')
        or (p_filters->>'scope'='my' and (
          t.owner_user_id=v_uid or t.created_by=v_uid or t.claimed_by=v_uid or t.reviewer_user_id=v_uid or t.approver_user_id=v_uid
          or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=v_uid)
        ))
        or (p_filters->>'scope'='open' and t.open_unassigned and t.status not in ('done','cancelled'))
        or (p_filters->>'scope'='completed' and t.status in ('done','cancelled'))
      )
  ), blocker_stats as materialized (
    select d.blocked_task_id task_id,
      count(*)::integer blocker_count,
      count(*) filter(where b.status not in ('done','cancelled'))::integer unfinished_blockers
    from public.task_dependencies d
    join base x on x.id=d.blocked_task_id
    join public.tasks b on b.id=d.blocker_task_id
    group by d.blocked_task_id
  ), downstream_stats as materialized (
    select d.blocker_task_id task_id,
      count(*)::integer downstream_count,
      count(*) filter(where n.status not in ('done','cancelled'))::integer unfinished_downstream
    from public.task_dependencies d
    join base x on x.id=d.blocker_task_id
    join public.tasks n on n.id=d.blocked_task_id
    group by d.blocker_task_id
  ), risked as materialized (
    select b.*,
      case when v_unscoped_view_all then
        jsonb_build_object(
          'score',least(100,
            (case when b.status not in ('done','cancelled') and b.due_at is not null and b.due_at<now() then 35 else 0 end)+
            (case when b.status='blocked' then 25 else 0 end)+
            (case when coalesce(bs.unfinished_blockers,0)>0 then 20 else 0 end)+
            (case when b.owner_user_id is null then 20 else 0 end)+
            least(coalesce(ds.unfinished_downstream,0)*5,20)
          ),
          'level',case
            when least(100,
              (case when b.status not in ('done','cancelled') and b.due_at is not null and b.due_at<now() then 35 else 0 end)+
              (case when b.status='blocked' then 25 else 0 end)+
              (case when coalesce(bs.unfinished_blockers,0)>0 then 20 else 0 end)+
              (case when b.owner_user_id is null then 20 else 0 end)+
              least(coalesce(ds.unfinished_downstream,0)*5,20)
            )>=85 then 'critical'
            when least(100,
              (case when b.status not in ('done','cancelled') and b.due_at is not null and b.due_at<now() then 35 else 0 end)+
              (case when b.status='blocked' then 25 else 0 end)+
              (case when coalesce(bs.unfinished_blockers,0)>0 then 20 else 0 end)+
              (case when b.owner_user_id is null then 20 else 0 end)+
              least(coalesce(ds.unfinished_downstream,0)*5,20)
            )>=60 then 'high'
            when least(100,
              (case when b.status not in ('done','cancelled') and b.due_at is not null and b.due_at<now() then 35 else 0 end)+
              (case when b.status='blocked' then 25 else 0 end)+
              (case when coalesce(bs.unfinished_blockers,0)>0 then 20 else 0 end)+
              (case when b.owner_user_id is null then 20 else 0 end)+
              least(coalesce(ds.unfinished_downstream,0)*5,20)
            )>=25 then 'medium' else 'low' end,
          'reasons',jsonb_strip_nulls(jsonb_build_object(
            'overdue',case when b.status not in ('done','cancelled') and b.due_at is not null and b.due_at<now() then true end,
            'blocked',case when b.status='blocked' then true end,
            'dependency_blocked',case when coalesce(bs.unfinished_blockers,0)>0 then true end,
            'no_owner',case when b.owner_user_id is null then true end,
            'downstream',case when coalesce(ds.unfinished_downstream,0)>0 then ds.unfinished_downstream end
          ))
        )
      else app_private.task_risk_snapshot(b.id) end risk,
      coalesce(bs.blocker_count,0) unrestricted_blocker_count,
      coalesce(ds.downstream_count,0) unrestricted_downstream_count
    from base b
    left join blocker_stats bs on bs.task_id=b.id
    left join downstream_stats ds on ds.task_id=b.id
  ), scoped as materialized (
    select * from risked
    where coalesce(p_filters->>'risk','') in ('','all') or risk->>'level'=p_filters->>'risk'
  ), page_ids as materialized (
    select id
    from scoped
    order by case when status in ('done','cancelled') then 1 else 0 end,
      coalesce((risk->>'score')::int,0) desc,
      due_at asc nulls last,
      created_at desc
    limit v_limit offset v_offset
  ), page_rows as (
    select
      s.*,
      owner_profile.full_name owner_name,
      pr.name project_name,
      site.name site_name,
      case when v_unscoped_manage then true else app_private.can_edit_task(s.id) end can_edit,
      case when v_unscoped_manage then true else app_private.can_complete_task(s.id) end can_complete,
      (
        s.open_unassigned and (
          v_unscoped_claim
          or (v_claim and app_private.work_permission_for_row(s.company_id,'tasks.claim',s.project_id,s.site_id,s.folder_id,s.document_id))
        )
      ) can_claim,
      (select count(*) from public.task_comments c where c.task_id=s.id and c.deleted_at is null) comment_count,
      (select count(*) from public.task_attachments a where a.task_id=s.id and a.upload_state='ready') attachment_count,
      case when v_unscoped_view_all then s.unrestricted_blocker_count else (
        select count(*) from public.task_dependencies d join public.tasks b on b.id=d.blocker_task_id
        where d.blocked_task_id=s.id and app_private.can_view_task(b.id)
      ) end blocker_count,
      case when v_unscoped_view_all then s.unrestricted_downstream_count else (
        select count(*) from public.task_dependencies d join public.tasks b on b.id=d.blocked_task_id
        where d.blocker_task_id=s.id and app_private.can_view_task(b.id)
      ) end downstream_count
    from scoped s
    join page_ids pg on pg.id=s.id
    left join public.profiles owner_profile on owner_profile.id=s.owner_user_id
    left join public.projects pr on pr.id=s.project_id
    left join public.sites site on site.id=s.site_id
    order by case when s.status in ('done','cancelled') then 1 else 0 end,
      coalesce((s.risk->>'score')::int,0) desc,
      s.due_at asc nulls last,
      s.created_at desc
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows),'[]'::jsonb),
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
