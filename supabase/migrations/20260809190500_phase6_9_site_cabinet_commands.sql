begin;
-- ---------------------------------------------------------------------------
-- Cabinet commands.
-- ---------------------------------------------------------------------------
create or replace function public.save_site_cabinet(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();v_id uuid:=nullif(p_payload->>'id','')::uuid;v_site uuid:=nullif(p_payload->>'site_id','')::uuid;
  s public.sites%rowtype;c public.site_cabinets%rowtype;v_root uuid;v_old_name text;v_old_code text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_site is null and v_id is not null then select site_id into v_site from public.site_cabinets where id=v_id; end if;
  select * into s from public.sites where id=v_site;
  if not found then raise exception 'Site not found'; end if;
  if not app_private.project_context_operational(s.project_id,s.id) then raise exception 'Project or site is archived'; end if;
  if not app_private.user_has_resource_permission(v_uid,s.company_id,'projects.edit',s.project_id,s.id,null,null) then raise exception 'Permission denied'; end if;
  if v_id is null then
    if not app_private.user_has_resource_permission(v_uid,s.company_id,'files.create_folder',s.project_id,s.id,null,null) then raise exception 'Creating a cabinet workspace also requires files.create_folder'; end if;
    insert into public.site_cabinets(company_id,project_id,site_id,code,name,cabinet_type,status,description,location_label,latitude,longitude,created_by)
    values(s.company_id,s.project_id,s.id,trim(p_payload->>'code'),trim(p_payload->>'name'),coalesce(nullif(trim(p_payload->>'cabinet_type'),''),'fiber_cabinet'),coalesce(nullif(trim(p_payload->>'status'),''),'planned'),nullif(trim(p_payload->>'description'),''),nullif(trim(p_payload->>'location_label'),''),nullif(p_payload->>'latitude','')::numeric,nullif(p_payload->>'longitude','')::numeric,v_uid)
    returning * into c;
    v_root:=app_private.seed_cabinet_workspace(c.id,v_uid);
    select * into c from public.site_cabinets where id=c.id;
  else
    select * into c from public.site_cabinets where id=v_id and site_id=s.id for update;
    if not found then raise exception 'Cabinet not found'; end if;
    if c.archived_at is not null or c.status='archived' then raise exception 'Reactivate cabinet before editing'; end if;
    v_old_name:=c.name;v_old_code:=c.code;
    update public.site_cabinets set
      code=trim(coalesce(nullif(p_payload->>'code',''),code)),
      name=trim(coalesce(nullif(p_payload->>'name',''),name)),
      cabinet_type=coalesce(nullif(trim(p_payload->>'cabinet_type'),''),cabinet_type),
      status=coalesce(nullif(trim(p_payload->>'status'),''),status),
      description=case when p_payload ? 'description' then nullif(trim(p_payload->>'description'),'') else description end,
      location_label=case when p_payload ? 'location_label' then nullif(trim(p_payload->>'location_label'),'') else location_label end,
      latitude=case when p_payload ? 'latitude' then nullif(p_payload->>'latitude','')::numeric else latitude end,
      longitude=case when p_payload ? 'longitude' then nullif(p_payload->>'longitude','')::numeric else longitude end
    where id=c.id returning * into c;
    if c.root_folder_id is not null and (c.name is distinct from v_old_name or c.code is distinct from v_old_code) then
      if not app_private.user_has_resource_permission(v_uid,c.company_id,'files.rename',c.project_id,c.site_id,c.root_folder_id,null) then raise exception 'Renaming cabinet also requires files.rename'; end if;
      update public.folders set name=trim(c.code)||' — '||trim(c.name),code=trim(c.code) where id=c.root_folder_id;
    end if;
  end if;
  perform app_private.notify_resource_members(c.company_id,v_uid,case when v_id is null then 'cabinet.created' else 'cabinet.updated' end,case when v_id is null then 'تمت إضافة كابينة للموقع' else 'تم تحديث كابينة' end,case when v_id is null then 'Site cabinet created' else 'Site cabinet updated' end,c.code||' — '||c.name,c.code||' — '||c.name,'site_cabinet',c.id,'projects.view',c.project_id,c.site_id,c.root_folder_id,null);
  return to_jsonb(c);
end $$;

create or replace function public.archive_site_cabinet(p_cabinet_id uuid)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare c public.site_cabinets%rowtype;begin
  select * into c from public.site_cabinets where id=p_cabinet_id for update;if not found then raise exception 'Cabinet not found';end if;
  if not app_private.user_has_resource_permission(auth.uid(),c.company_id,'projects.archive',c.project_id,c.site_id,null,null) then raise exception 'Permission denied';end if;
  update public.site_cabinets set status='archived',archived_at=now() where id=c.id returning * into c;
  return to_jsonb(c);
end $$;

create or replace function public.reactivate_site_cabinet(p_cabinet_id uuid)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare c public.site_cabinets%rowtype;begin
  select * into c from public.site_cabinets where id=p_cabinet_id for update;if not found then raise exception 'Cabinet not found';end if;
  if not app_private.user_has_resource_permission(auth.uid(),c.company_id,'projects.archive',c.project_id,c.site_id,null,null) then raise exception 'Permission denied';end if;
  if not app_private.project_context_operational(c.project_id,c.site_id) then raise exception 'Reactivate project/site first';end if;
  update public.site_cabinets set status='active',archived_at=null where id=c.id returning * into c;
  return to_jsonb(c);
end $$;

create or replace function public.cabinet_360(p_cabinet_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$
declare c public.site_cabinets%rowtype;v_ready int:=0;v_total int:=4;
begin
  select * into c from public.site_cabinets where id=p_cabinet_id;if not found then raise exception 'Cabinet not found';end if;
  if not app_private.user_has_resource_permission(auth.uid(),c.company_id,'projects.view',c.project_id,c.site_id,null,null) then raise exception 'Permission denied';end if;
  with recursive df as(
    select id,code,name from public.folders where id=c.root_folder_id and trashed_at is null
    union all select f.id,f.code,f.name from public.folders f join df p on f.parent_id=p.id where f.trashed_at is null
  ), cats as(
    select
      exists(select 1 from public.documents d join df on df.id=d.folder_id where d.state='active' and df.code='C01') drawings,
      exists(select 1 from public.documents d join df on df.id=d.folder_id where d.state='active' and df.code='C02') qty,
      exists(select 1 from public.documents d join df on df.id=d.folder_id where d.state='active' and df.code='C03') sketches,
      exists(select 1 from public.documents d join df on df.id=d.folder_id where d.state='active' and df.code='C04') handover
  ) select (drawings::int+qty::int+sketches::int+handover::int) into v_ready from cats;
  return jsonb_build_object(
    'cabinet',to_jsonb(c),
    'project',(select jsonb_build_object('id',p.id,'code',p.code,'name',p.name) from public.projects p where p.id=c.project_id),
    'site',(select jsonb_build_object('id',s.id,'code',s.code,'name',s.name) from public.sites s where s.id=c.site_id),
    'root_folder',(select jsonb_build_object('id',f.id,'name',f.name,'code',f.code) from public.folders f where f.id=c.root_folder_id),
    'folders',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'code',f.code,'name',f.name,'sort_order',f.sort_order) order by f.sort_order) from public.folders f where f.parent_id=c.root_folder_id and f.trashed_at is null),'[]'::jsonb),
    'stats',jsonb_build_object(
      'documents',(with recursive df as(select id from public.folders where id=c.root_folder_id union all select f.id from public.folders f join df on f.parent_id=df.id where f.trashed_at is null) select count(*) from public.documents d where d.folder_id in(select id from df) and d.state='active' and app_private.user_has_resource_permission(auth.uid(),c.company_id,'files.view',c.project_id,c.site_id,d.folder_id,null)),
      'drawings',(with recursive df as(select id from public.folders where id=c.root_folder_id union all select f.id from public.folders f join df on f.parent_id=df.id where f.trashed_at is null) select count(*) from public.engineering_drawings d where d.folder_id in(select id from df) and d.archived_at is null and app_private.can_view_engineering_drawing(d.id)),
      'open_tasks',(with recursive df as(select id from public.folders where id=c.root_folder_id union all select f.id from public.folders f join df on f.parent_id=df.id where f.trashed_at is null) select count(*) from public.tasks t where t.folder_id in(select id from df) and t.status not in('done','cancelled') and app_private.can_view_task(t.id)),
      'claim_items',(select count(*) from public.site_claim_items i where i.cabinet_id=c.id),
      'readiness_percent',round(v_ready::numeric/greatest(v_total,1)*100)
    ),
    'can_manage',app_private.user_has_resource_permission(auth.uid(),c.company_id,'projects.edit',c.project_id,c.site_id,null,null),
    'can_archive',app_private.user_has_resource_permission(auth.uid(),c.company_id,'projects.archive',c.project_id,c.site_id,null,null)
  );
end $$;

commit;
