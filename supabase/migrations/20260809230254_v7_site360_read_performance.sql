-- Optimum V7 — Site 360 read-model performance and drawing-scope correctness.
-- Keeps public.site_360(uuid) response contract intact.

create or replace function public.site_360(p_site_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  s public.sites%rowtype;
  p public.projects%rowtype;
  v_package uuid;
  v_claim jsonb;
  v_unscoped_files boolean:=false;
  v_unscoped_tasks boolean:=false;
  v_unscoped_drawings boolean:=false;
  v_folders integer:=0;
  v_documents integer:=0;
  v_storage_bytes bigint:=0;
  v_open_tasks integer:=0;
  v_overdue_tasks integer:=0;
  v_drawings integer:=0;
  v_cabinets integer:=0;
  v_cabinets_json jsonb:='[]'::jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into s from public.sites where id=p_site_id;
  if not found then raise exception 'Site not found'; end if;
  select * into p from public.projects where id=s.project_id;
  if not app_private.user_has_resource_permission(v_uid,s.company_id,'projects.view',s.project_id,s.id,null,null) then raise exception 'Permission denied'; end if;

  v_unscoped_files:=app_private.user_permission_is_unscoped(v_uid,s.company_id,'files.view');
  v_unscoped_tasks:=app_private.has_company_permission(s.company_id,'tasks.view_all')
    and app_private.user_permission_is_unscoped(v_uid,s.company_id,'tasks.view');
  v_unscoped_drawings:=app_private.user_permission_is_unscoped(v_uid,s.company_id,'drawings.view');

  select id into v_package
  from public.site_claim_packages
  where site_id=s.id and claim_type='final' and status<>'archived'
  order by created_at limit 1;

  if v_package is not null and app_private.user_has_resource_permission(v_uid,s.company_id,'files.view',s.project_id,s.id,null,null) then
    v_claim:=public.site_claim_package_360(v_package);
  end if;

  select count(*) into v_folders
  from public.folders f
  where f.site_id=s.id and f.trashed_at is null
    and (v_unscoped_files or app_private.user_has_resource_permission(v_uid,s.company_id,'files.view',s.project_id,s.id,f.id,null));

  select count(*) into v_documents
  from public.documents d
  where d.site_id=s.id and d.state='active'
    and (v_unscoped_files or app_private.user_has_resource_permission(v_uid,s.company_id,'files.view',s.project_id,s.id,d.folder_id,null));

  select coalesce(sum(v.size_bytes),0) into v_storage_bytes
  from public.document_versions v
  join public.documents d on d.id=v.document_id
  where d.site_id=s.id and v.upload_state='ready'
    and (v_unscoped_files or app_private.user_has_resource_permission(v_uid,s.company_id,'files.view',s.project_id,s.id,d.folder_id,null));

  select
    count(*) filter(where t.status not in('done','cancelled')),
    count(*) filter(where t.status not in('done','cancelled') and t.due_at<now())
  into v_open_tasks,v_overdue_tasks
  from public.tasks t
  where t.site_id=s.id and (v_unscoped_tasks or app_private.can_view_task(t.id));

  select count(*) into v_drawings
  from public.engineering_drawings d
  where d.site_id=s.id and d.archived_at is null
    and (v_unscoped_drawings or app_private.user_has_resource_permission(v_uid,d.company_id,'drawings.view',d.project_id,d.site_id,d.folder_id,d.id));

  select count(*) into v_cabinets
  from public.site_cabinets c
  where c.site_id=s.id and c.archived_at is null;

  with claim_counts as (
    select i.cabinet_id,count(*)::integer claim_items
    from public.site_claim_items i
    where i.cabinet_id is not null
      and exists(select 1 from public.site_claim_packages cp where cp.id=i.package_id and cp.site_id=s.id)
    group by i.cabinet_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'code',c.code,
    'name',c.name,
    'cabinet_type',c.cabinet_type,
    'status',c.status,
    'description',c.description,
    'location_label',c.location_label,
    'root_folder_id',c.root_folder_id,
    'archived_at',c.archived_at,
    'claim_items',coalesce(cc.claim_items,0)
  ) order by c.archived_at nulls first,c.code),'[]'::jsonb)
  into v_cabinets_json
  from public.site_cabinets c
  left join claim_counts cc on cc.cabinet_id=c.id
  where c.site_id=s.id;

  return jsonb_build_object(
    'site',to_jsonb(s),
    'project',jsonb_build_object('id',p.id,'code',p.code,'name',p.name),
    'manager_name',(select full_name from public.profiles where id=s.manager_user_id),
    'stats',jsonb_build_object(
      'folders',v_folders,
      'documents',v_documents,
      'storage_bytes',v_storage_bytes,
      'open_tasks',v_open_tasks,
      'overdue_tasks',v_overdue_tasks,
      'drawings',v_drawings,
      'cabinets',v_cabinets
    ),
    'cabinets',v_cabinets_json,
    'claim_package',coalesce(v_claim,'null'::jsonb),
    'can_create_cabinet',app_private.user_has_resource_permission(v_uid,s.company_id,'projects.edit',s.project_id,s.id,null,null)
      and app_private.user_has_resource_permission(v_uid,s.company_id,'files.create_folder',s.project_id,s.id,null,null),
    'can_manage_cabinets',app_private.user_has_resource_permission(v_uid,s.company_id,'projects.edit',s.project_id,s.id,null,null),
    'can_manage_claim',app_private.user_has_resource_permission(v_uid,s.company_id,'files.manage',s.project_id,s.id,null,null),
    'can_edit_site',app_private.user_has_resource_permission(v_uid,s.company_id,'projects.edit',s.project_id,s.id,null,null),
    'can_archive_site',app_private.user_has_resource_permission(v_uid,s.company_id,'projects.archive',s.project_id,s.id,null,null)
  );
end;
$$;

revoke all on function public.site_360(uuid) from public,anon;
grant execute on function public.site_360(uuid) to authenticated;
