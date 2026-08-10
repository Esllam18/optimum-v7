begin;
-- ---------------------------------------------------------------------------
-- Claim package commands + version freeze.
-- ---------------------------------------------------------------------------
create or replace function public.site_claim_package_360(p_package_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$
declare p public.site_claim_packages%rowtype;v_required int;v_satisfied int;v_req_pct int;v_cabinets int;v_covered int;v_cab_pct int;v_overall int;
begin
  select * into p from public.site_claim_packages where id=p_package_id;if not found then raise exception 'Claim package not found';end if;
  if not app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.project_id,p.site_id,null,null) then raise exception 'Permission denied';end if;
  select count(*),count(*) filter(where (select count(*) from public.site_claim_items i join public.documents d on d.id=i.document_id where i.requirement_id=r.id and i.status<>'rejected' and d.state='active' and d.current_version_id is not null)>=r.min_items)
  into v_required,v_satisfied from public.site_claim_requirements r where r.package_id=p.id and r.is_required;
  v_req_pct:=case when v_required=0 then 100 else round(v_satisfied::numeric/v_required*100) end;
  select count(*) into v_cabinets from public.site_cabinets c where c.site_id=p.site_id and c.archived_at is null;
  select count(distinct i.cabinet_id) into v_covered from public.site_claim_items i join public.site_cabinets c on c.id=i.cabinet_id where i.package_id=p.id and i.status<>'rejected' and c.archived_at is null;
  v_cab_pct:=case when v_cabinets=0 then 100 else round(v_covered::numeric/v_cabinets*100) end;
  v_overall:=round(v_req_pct*0.7+v_cab_pct*0.3);
  return jsonb_build_object(
    'package',to_jsonb(p),
    'site',(select jsonb_build_object('id',s.id,'code',s.code,'name',s.name) from public.sites s where s.id=p.site_id),
    'project',(select jsonb_build_object('id',x.id,'code',x.code,'name',x.name) from public.projects x where x.id=p.project_id),
    'progress',jsonb_build_object('required_percent',v_req_pct,'cabinet_coverage_percent',v_cab_pct,'overall_percent',v_overall,'required_total',v_required,'required_satisfied',v_satisfied,'cabinet_total',v_cabinets,'cabinet_covered',v_covered),
    'requirements',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'requirement_key',r.requirement_key,'label_ar',r.label_ar,'label_en',r.label_en,'category',r.category,'is_required',r.is_required,'min_items',r.min_items,'sort_order',r.sort_order,
      'item_count',(select count(*) from public.site_claim_items i join public.documents d on d.id=i.document_id where i.requirement_id=r.id and i.status<>'rejected' and d.state='active'),
      'satisfied',((select count(*) from public.site_claim_items i join public.documents d on d.id=i.document_id where i.requirement_id=r.id and i.status<>'rejected' and d.state='active' and d.current_version_id is not null)>=r.min_items),
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'document_id',d.id,'display_name',d.display_name,'document_type',d.document_type,'control_status',d.control_status,'current_version_id',d.current_version_id,'selected_version_id',i.selected_version_id,'cabinet_id',i.cabinet_id,'cabinet_code',c.code,'cabinet_name',c.name,'inclusion_mode',i.inclusion_mode,'status',i.status,'folder_id',d.folder_id) order by i.created_at) from public.site_claim_items i join public.documents d on d.id=i.document_id left join public.site_cabinets c on c.id=i.cabinet_id where i.requirement_id=r.id and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.project_id,p.site_id,d.folder_id,null)),'[]'::jsonb)
    ) order by r.sort_order,r.created_at) from public.site_claim_requirements r where r.package_id=p.id),'[]'::jsonb),
    'can_manage',app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.manage',p.project_id,p.site_id,null,null)
  );
end $$;

create or replace function public.save_site_claim_requirement(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$
declare v_id uuid:=nullif(p_payload->>'id','')::uuid;v_package uuid:=nullif(p_payload->>'package_id','')::uuid;p public.site_claim_packages%rowtype;r public.site_claim_requirements%rowtype;
begin
  select * into p from public.site_claim_packages where id=v_package;if not found then raise exception 'Claim package not found';end if;
  if p.locked_at is not null or p.status in('submitted','approved','archived') then raise exception 'Claim package is locked';end if;
  if not app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.manage',p.project_id,p.site_id,null,null) then raise exception 'Permission denied';end if;
  if v_id is null then
    insert into public.site_claim_requirements(company_id,package_id,requirement_key,label_ar,label_en,category,is_required,min_items,sort_order,notes,created_by)
    values(p.company_id,p.id,lower(regexp_replace(trim(p_payload->>'requirement_key'),'[^a-zA-Z0-9_-]+','_','g')),trim(p_payload->>'label_ar'),trim(p_payload->>'label_en'),coalesce(nullif(trim(p_payload->>'category'),''),'supporting'),coalesce((p_payload->>'is_required')::boolean,true),greatest(0,coalesce((p_payload->>'min_items')::int,1)),coalesce((p_payload->>'sort_order')::int,100),nullif(trim(p_payload->>'notes'),''),auth.uid()) returning * into r;
  else
    select * into r from public.site_claim_requirements where id=v_id and package_id=p.id for update;if not found then raise exception 'Requirement not found';end if;
    update public.site_claim_requirements set label_ar=trim(p_payload->>'label_ar'),label_en=trim(p_payload->>'label_en'),category=coalesce(nullif(trim(p_payload->>'category'),''),category),is_required=coalesce((p_payload->>'is_required')::boolean,is_required),min_items=greatest(0,coalesce((p_payload->>'min_items')::int,min_items)),sort_order=coalesce((p_payload->>'sort_order')::int,sort_order),notes=case when p_payload?'notes' then nullif(trim(p_payload->>'notes'),'') else notes end where id=r.id returning * into r;
  end if;
  return to_jsonb(r);
end $$;

create or replace function public.add_document_to_site_claim(p_document_id uuid,p_requirement_key text,p_package_id uuid default null,p_cabinet_id uuid default null,p_inclusion_mode text default 'manual')
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$
declare d public.documents%rowtype;p public.site_claim_packages%rowtype;r public.site_claim_requirements%rowtype;i public.site_claim_items%rowtype;v_package uuid:=p_package_id;v_cab uuid:=p_cabinet_id;
begin
  select * into d from public.documents where id=p_document_id and state='active';if not found or d.site_id is null then raise exception 'Only active site documents can be added to a site claim';end if;
  if not app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.manage',d.project_id,d.site_id,d.folder_id,null) then raise exception 'Permission denied';end if;
  if v_package is null then select id into v_package from public.site_claim_packages where site_id=d.site_id and claim_type='final' and status<>'archived' order by created_at limit 1;end if;
  select * into p from public.site_claim_packages where id=v_package and site_id=d.site_id;if not found then raise exception 'Claim package does not belong to document site';end if;
  if p.locked_at is not null or p.status in('submitted','approved','archived') then raise exception 'Claim package is locked';end if;
  select * into r from public.site_claim_requirements where package_id=p.id and requirement_key=p_requirement_key;if not found then raise exception 'Claim requirement not found';end if;
  if v_cab is null then v_cab:=app_private.cabinet_for_folder(d.folder_id);end if;
  if v_cab is not null and not exists(select 1 from public.site_cabinets c where c.id=v_cab and c.site_id=d.site_id) then raise exception 'Cabinet does not belong to document site';end if;
  insert into public.site_claim_items(company_id,package_id,requirement_id,document_id,cabinet_id,inclusion_mode,status,added_by)
  values(d.company_id,p.id,r.id,d.id,v_cab,case when p_inclusion_mode in('manual','upload','auto') then p_inclusion_mode else 'manual' end,'included',auth.uid())
  on conflict(package_id,requirement_id,document_id) do update set cabinet_id=coalesce(excluded.cabinet_id,site_claim_items.cabinet_id),inclusion_mode=excluded.inclusion_mode,status='included',selected_version_id=null,updated_at=now()
  returning * into i;
  return to_jsonb(i);
end $$;

create or replace function public.remove_site_claim_item(p_item_id uuid)
returns void language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare i public.site_claim_items%rowtype;p public.site_claim_packages%rowtype;d public.documents%rowtype;begin
  select * into i from public.site_claim_items where id=p_item_id;select * into p from public.site_claim_packages where id=i.package_id;select * into d from public.documents where id=i.document_id;
  if i.id is null or p.id is null then raise exception 'Claim item not found';end if;
  if p.locked_at is not null or p.status in('submitted','approved','archived') then raise exception 'Claim package is locked';end if;
  if not app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.manage',p.project_id,p.site_id,d.folder_id,null) then raise exception 'Permission denied';end if;
  delete from public.site_claim_items where id=i.id;
end $$;

create or replace function public.freeze_site_claim_package(p_package_id uuid)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare p public.site_claim_packages%rowtype;v_missing int;v_bad int;begin
  select * into p from public.site_claim_packages where id=p_package_id for update;if not found then raise exception 'Claim package not found';end if;
  if not app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.manage',p.project_id,p.site_id,null,null) then raise exception 'Permission denied';end if;
  if p.status in('submitted','approved','archived') then raise exception 'Claim package cannot be frozen in its current status';end if;
  select count(*) into v_missing from public.site_claim_requirements r where r.package_id=p.id and r.is_required and (select count(*) from public.site_claim_items i join public.documents d on d.id=i.document_id where i.requirement_id=r.id and i.status<>'rejected' and d.state='active' and d.current_version_id is not null)<r.min_items;
  if v_missing>0 then raise exception 'Claim package is incomplete: % required requirement(s) are still missing',v_missing;end if;
  select count(*) into v_bad from public.site_claim_items i join public.documents d on d.id=i.document_id left join public.document_versions v on v.id=d.current_version_id where i.package_id=p.id and (d.state<>'active' or d.current_version_id is null or v.upload_state<>'ready');
  if v_bad>0 then raise exception 'Claim package contains documents without a ready current version';end if;
  update public.site_claim_items i set selected_version_id=d.current_version_id from public.documents d where i.package_id=p.id and d.id=i.document_id;
  update public.site_claim_packages set status='ready',locked_at=now(),locked_by=auth.uid() where id=p.id returning * into p;
  return to_jsonb(p);
end $$;

create or replace function public.reopen_site_claim_package(p_package_id uuid)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare p public.site_claim_packages%rowtype;begin
  select * into p from public.site_claim_packages where id=p_package_id for update;if not found then raise exception 'Claim package not found';end if;
  if not app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.manage',p.project_id,p.site_id,null,null) then raise exception 'Permission denied';end if;
  if p.status in('submitted','approved','archived') then raise exception 'Submitted/approved packages cannot be reopened directly';end if;
  update public.site_claim_items set selected_version_id=null where package_id=p.id;
  update public.site_claim_packages set status='collecting',locked_at=null,locked_by=null where id=p.id returning * into p;
  return to_jsonb(p);
end $$;

create or replace function public.submit_site_claim_package(p_package_id uuid)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$ declare p public.site_claim_packages%rowtype;begin
  select * into p from public.site_claim_packages where id=p_package_id for update;if not found then raise exception 'Claim package not found';end if;
  if not app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.manage',p.project_id,p.site_id,null,null) then raise exception 'Permission denied';end if;
  if p.locked_at is null or p.status<>'ready' then raise exception 'Freeze the complete package before submission';end if;
  update public.site_claim_packages set status='submitted',submitted_at=now() where id=p.id returning * into p;
  return to_jsonb(p);
end $$;

commit;
