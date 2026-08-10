-- Optimum 6.9.0 — Site claim auto-collection from recognized delivery folders.
begin;
create or replace function app_private.infer_site_claim_requirement(p_document_id uuid)
returns text language plpgsql stable security definer set search_path='public','pg_temp'
as $$
declare d public.documents%rowtype;v_names text:='';v_codes text:='';v_key text;
begin
  select * into d from public.documents where id=p_document_id;if not found or d.site_id is null then return null;end if;
  with recursive a as(
    select f.id,f.parent_id,coalesce(f.code,'') code,lower(f.name) name from public.folders f where f.id=d.folder_id
    union all select p.id,p.parent_id,coalesce(p.code,''),lower(p.name) from public.folders p join a on a.parent_id=p.id
  ) select string_agg(code,'|'),string_agg(name,'|') into v_codes,v_names from a;
  if v_codes~'(^|\|)C01(\||$)' then v_key:='as_built_drawings';
  elsif v_codes~'(^|\|)C02(\||$)' then v_key:='quantity_survey';
  elsif v_codes~'(^|\|)C03(\||$)' then v_key:='sketches';
  elsif v_codes~'(^|\|)C04(\||$)' then v_key:='handover_certificate';
  elsif v_codes~'(^|\|)C05(\||$)' then v_key:='photos';
  elsif v_codes~'(^|\|)C06(\||$)' then v_key:='supporting';
  elsif lower(d.document_type)='contract' or v_names~'contract|عقد' then v_key:='contract';
  elsif lower(d.display_name)~'work[ _-]?order|تكليف' or array_to_string(d.tags,' ')~*'work[ _-]?order|تكليف' or v_names~'work orders|أوامر التكليف' then v_key:='work_order';
  elsif v_names~'quantity|boq|حصر|كميات' then v_key:='quantity_survey';
  elsif v_names~'sketch|اسكتش' then v_key:='sketches';
  elsif v_names~'handover|certificate|تسليم|شهاد' then v_key:='handover_certificate';
  elsif v_names~'as-built|as built' or array_to_string(d.tags,' ')~*'as[- ]?built' then v_key:='as_built_drawings';
  elsif v_names~'approval|اعتماد|موافق' then v_key:='approvals';
  elsif lower(d.document_type)='photo' or v_names~'photo|صور' then v_key:='photos';
  end if;
  return v_key;
end $$;
create or replace function public.site_claim_suggestions(p_package_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$
declare p public.site_claim_packages%rowtype;begin
  select * into p from public.site_claim_packages where id=p_package_id;if not found then raise exception 'Claim package not found';end if;
  if not app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.manage',p.project_id,p.site_id,null,null) then raise exception 'Permission denied';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('document_id',q.id,'display_name',q.display_name,'folder_id',q.folder_id,'requirement_key',q.req_key,'requirement_label_ar',r.label_ar,'requirement_label_en',r.label_en,'cabinet_id',q.cabinet_id,'current_version_id',q.current_version_id) order by r.sort_order,q.display_name)
    from(select d.*,app_private.infer_site_claim_requirement(d.id) req_key,app_private.cabinet_for_folder(d.folder_id) cabinet_id from public.documents d join public.document_versions v on v.id=d.current_version_id and v.upload_state='ready' where d.site_id=p.site_id and d.state='active' and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.manage',p.project_id,p.site_id,d.folder_id,null))q
    join public.site_claim_requirements r on r.package_id=p.id and r.requirement_key=q.req_key
    where q.req_key is not null and not exists(select 1 from public.site_claim_items i where i.package_id=p.id and i.requirement_id=r.id and i.document_id=q.id)),'[]'::jsonb);
end $$;
create or replace function public.auto_collect_site_claim(p_package_id uuid)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp'
as $$
declare p public.site_claim_packages%rowtype;s jsonb;item jsonb;v_added int:=0;v_req uuid;
begin
  select * into p from public.site_claim_packages where id=p_package_id for update;if not found then raise exception 'Claim package not found';end if;
  if p.locked_at is not null or p.status in('submitted','approved','archived') then raise exception 'Claim package is locked';end if;
  if not app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.manage',p.project_id,p.site_id,null,null) then raise exception 'Permission denied';end if;
  s:=public.site_claim_suggestions(p.id);
  for item in select value from jsonb_array_elements(s) loop
    select id into v_req from public.site_claim_requirements where package_id=p.id and requirement_key=item->>'requirement_key';
    insert into public.site_claim_items(company_id,package_id,requirement_id,document_id,cabinet_id,inclusion_mode,status,added_by)
    values(p.company_id,p.id,v_req,(item->>'document_id')::uuid,nullif(item->>'cabinet_id','')::uuid,'auto','included',auth.uid()) on conflict(package_id,requirement_id,document_id) do nothing;
    if found then v_added:=v_added+1;end if;
  end loop;
  return jsonb_build_object('added',v_added,'suggested',jsonb_array_length(s));
end $$;
revoke all on function app_private.infer_site_claim_requirement(uuid) from public,anon,authenticated;
revoke all on function public.site_claim_suggestions(uuid),public.auto_collect_site_claim(uuid) from public,anon;
grant execute on function public.site_claim_suggestions(uuid),public.auto_collect_site_claim(uuid) to authenticated;
commit;
