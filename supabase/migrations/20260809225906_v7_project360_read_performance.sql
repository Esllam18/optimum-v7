-- Optimum V7 — Project 360 read-model performance and drawing-scope correctness.
-- Keeps the public.project_360(uuid) contract intact.

create or replace function public.project_360(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  p public.projects%rowtype;
  v_manage boolean:=false;
  v_unscoped_files boolean:=false;
  v_unscoped_tasks boolean:=false;
  v_unscoped_drawings boolean:=false;
  v_unscoped_project_view boolean:=false;
  v_sites integer:=0;
  v_cabinets integer:=0;
  v_claim_packages integer:=0;
  v_folders integer:=0;
  v_documents integer:=0;
  v_storage_bytes bigint:=0;
  v_open_tasks integer:=0;
  v_overdue_tasks integer:=0;
  v_blocked_tasks integer:=0;
  v_drawings integer:=0;
  v_milestones integer:=0;
  v_health integer:=100;
  v_sites_json jsonb:='[]'::jsonb;
  v_recent_activity jsonb:='[]'::jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into p from public.projects where id=p_project_id;
  if not found or not app_private.user_has_resource_permission(v_uid,p.company_id,'projects.view',p.id,null,null,null) then
    raise exception 'Permission denied';
  end if;

  v_manage:=app_private.user_has_resource_permission(v_uid,p.company_id,'projects.edit',p.id,null,null,null);
  v_unscoped_project_view:=app_private.user_permission_is_unscoped(v_uid,p.company_id,'projects.view');
  v_unscoped_files:=app_private.user_permission_is_unscoped(v_uid,p.company_id,'files.view');
  v_unscoped_tasks:=app_private.has_company_permission(p.company_id,'tasks.view_all')
    and app_private.user_permission_is_unscoped(v_uid,p.company_id,'tasks.view');
  v_unscoped_drawings:=app_private.user_permission_is_unscoped(v_uid,p.company_id,'drawings.view');

  select count(*) into v_sites
  from public.sites s
  where s.project_id=p.id and s.archived_at is null
    and (v_unscoped_project_view or app_private.user_has_resource_permission(v_uid,p.company_id,'projects.view',p.id,s.id,null,null));

  select count(*) into v_cabinets
  from public.site_cabinets c
  where c.project_id=p.id and c.archived_at is null
    and (v_unscoped_project_view or app_private.user_has_resource_permission(v_uid,p.company_id,'projects.view',p.id,c.site_id,null,null));

  select count(*) into v_claim_packages
  from public.site_claim_packages cp
  where cp.project_id=p.id and cp.status<>'archived'
    and (v_unscoped_files or app_private.user_has_resource_permission(v_uid,p.company_id,'files.view',p.id,cp.site_id,null,null));

  select count(*) into v_folders
  from public.folders f
  where f.project_id=p.id and f.trashed_at is null
    and (v_unscoped_files or app_private.user_has_resource_permission(v_uid,p.company_id,'files.view',p.id,f.site_id,f.id,null));

  select count(*) into v_documents
  from public.documents d
  where d.project_id=p.id and d.state='active'
    and (v_unscoped_files or app_private.user_has_resource_permission(v_uid,p.company_id,'files.view',p.id,d.site_id,d.folder_id,null));

  select coalesce(sum(v.size_bytes),0) into v_storage_bytes
  from public.document_versions v
  join public.documents d on d.id=v.document_id
  where d.project_id=p.id and v.upload_state='ready'
    and (v_unscoped_files or app_private.user_has_resource_permission(v_uid,p.company_id,'files.view',p.id,d.site_id,d.folder_id,null));

  select
    count(*) filter(where t.status not in('done','cancelled')),
    count(*) filter(where t.status not in('done','cancelled') and t.due_at<now()),
    count(*) filter(where t.status='blocked')
  into v_open_tasks,v_overdue_tasks,v_blocked_tasks
  from public.tasks t
  where t.project_id=p.id
    and (v_unscoped_tasks or app_private.can_view_task(t.id));

  select count(*) into v_drawings
  from public.engineering_drawings d
  where d.project_id=p.id and d.archived_at is null
    and (
      v_unscoped_drawings
      or app_private.user_has_resource_permission(v_uid,d.company_id,'drawings.view',d.project_id,d.site_id,d.folder_id,d.id)
    );

  select count(*) into v_milestones
  from public.work_milestones m
  where m.project_id=p.id;

  v_health:=greatest(0,100-least(35,v_overdue_tasks*5)-least(25,v_blocked_tasks*5));

  with cabinet_counts as (
    select c.site_id,count(*)::integer cabinets
    from public.site_cabinets c
    where c.project_id=p.id and c.archived_at is null
    group by c.site_id
  ), final_claims as (
    select distinct on (cp.site_id) cp.site_id,cp.status
    from public.site_claim_packages cp
    where cp.project_id=p.id and cp.claim_type='final' and cp.status<>'archived'
    order by cp.site_id,cp.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,
    'code',s.code,
    'name',s.name,
    'status',s.status,
    'manager_user_id',s.manager_user_id,
    'manager_name',pr.full_name,
    'address',s.address,
    'archived_at',s.archived_at,
    'cabinets',coalesce(cc.cabinets,0),
    'claim_status',fc.status
  ) order by s.archived_at nulls first,s.name),'[]'::jsonb)
  into v_sites_json
  from public.sites s
  left join public.profiles pr on pr.id=s.manager_user_id
  left join cabinet_counts cc on cc.site_id=s.id
  left join final_claims fc on fc.site_id=s.id
  where s.project_id=p.id
    and (v_unscoped_project_view or app_private.user_has_resource_permission(v_uid,p.company_id,'projects.view',p.id,s.id,null,null));

  if app_private.has_company_permission(p.company_id,'audit.view') then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
    into v_recent_activity
    from (
      select a.id,a.action,a.entity_type,a.entity_id,a.actor_id,a.metadata,a.created_at
      from public.audit_events a
      where a.company_id=p.company_id
        and (
          a.entity_id=p.id
          or a.metadata#>>'{after,project_id}'=p.id::text
          or a.metadata#>>'{before,project_id}'=p.id::text
        )
      order by a.created_at desc
      limit 15
    ) x;
  end if;

  return jsonb_build_object(
    'project',to_jsonb(p),
    'blueprint',(select jsonb_build_object('id',b.id,'code',b.code,'name_ar',b.name_ar,'name_en',b.name_en) from public.project_blueprints b where b.id=p.blueprint_id),
    'manager_name',(select full_name from public.profiles where id=p.manager_user_id),
    'stats',jsonb_build_object(
      'sites',v_sites,
      'cabinets',v_cabinets,
      'claim_packages',v_claim_packages,
      'folders',v_folders,
      'documents',v_documents,
      'storage_bytes',v_storage_bytes,
      'open_tasks',v_open_tasks,
      'overdue_tasks',v_overdue_tasks,
      'blocked_tasks',v_blocked_tasks,
      'drawings',v_drawings,
      'milestones',v_milestones
    ),
    'sites',v_sites_json,
    'health',jsonb_build_object('score',v_health,'archived',p.archived_at is not null),
    'recent_activity',v_recent_activity,
    'can_manage',v_manage
  );
end;
$$;

revoke all on function public.project_360(uuid) from public,anon;
grant execute on function public.project_360(uuid) to authenticated;
