begin;

-- Phase 5.3 — make identity, roles, settings, and activity workflows verifiably operational.

-- Storage policies on the shared storage.objects table can be planned together.
-- These boolean helpers are safe to expose because each performs its own tenant check.
grant usage on schema app_private to authenticated;
grant execute on function app_private.can_view_engineering_drawing(uuid) to authenticated;
grant execute on function app_private.can_view_task(uuid) to authenticated;
grant execute on function app_private.can_access_storage_object(text,text) to authenticated;

create or replace function public.save_company_role_definition(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_role public.roles%rowtype;
  v_role_id uuid := nullif(p_payload->>'role_id','')::uuid;
  v_company_id uuid := nullif(p_payload->>'company_id','')::uuid;
  v_permissions text[] := array[]::text[];
  v_count integer := 0;
  v_is_new boolean := v_role_id is null;
  v_slug text;
begin
  select coalesce(array_agg(distinct value order by value),array[]::text[])
    into v_permissions
  from jsonb_array_elements_text(coalesce(p_payload->'permission_keys','[]'::jsonb));

  if exists(
    select 1 from unnest(v_permissions) k
    left join public.permissions p on p.key=k
    where p.key is null
  ) then raise exception 'Unknown permission key'; end if;

  if cardinality(v_permissions)=0 and coalesce((p_payload->>'allow_empty')::boolean,false)=false then
    raise exception 'Select at least one permission';
  end if;

  if v_is_new then
    if v_company_id is null then raise exception 'Company is required'; end if;
    if not (app_private.has_company_permission(v_company_id,'roles.create') or app_private.has_company_permission(v_company_id,'roles.manage') or app_private.is_platform_admin()) then
      raise exception 'Role creation permission denied';
    end if;
    v_slug := lower(trim(coalesce(p_payload->>'slug','')));
    if trim(coalesce(p_payload->>'name_ar',''))='' or trim(coalesce(p_payload->>'name_en',''))='' or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      raise exception 'Invalid role details';
    end if;
    insert into public.roles(company_id,name_ar,name_en,slug,description_ar,description_en,color,icon,is_default,is_protected,source_template_id,created_by)
    values(
      v_company_id,trim(p_payload->>'name_ar'),trim(p_payload->>'name_en'),v_slug,
      nullif(trim(coalesce(p_payload->>'description_ar','')),''),nullif(trim(coalesce(p_payload->>'description_en','')),''),
      coalesce(nullif(p_payload->>'color',''),'#4f46e5'),coalesce(nullif(p_payload->>'icon',''),'shield'),false,false,
      nullif(p_payload->>'template_id','')::uuid,auth.uid()
    ) returning * into v_role;
    v_role_id := v_role.id;
  else
    select * into v_role from public.roles where id=v_role_id for update;
    if not found then raise exception 'Role not found'; end if;
    if v_role.slug='owner' then raise exception 'Owner role is protected'; end if;
    if not (app_private.has_company_permission(v_role.company_id,'roles.manage') or app_private.is_platform_admin()) then
      raise exception 'Role management permission denied';
    end if;
    update public.roles set
      name_ar=trim(coalesce(p_payload->>'name_ar',name_ar)),
      name_en=trim(coalesce(p_payload->>'name_en',name_en)),
      description_ar=case when p_payload ? 'description_ar' then nullif(trim(coalesce(p_payload->>'description_ar','')),'') else description_ar end,
      description_en=case when p_payload ? 'description_en' then nullif(trim(coalesce(p_payload->>'description_en','')),'') else description_en end,
      color=coalesce(nullif(p_payload->>'color',''),color),
      icon=coalesce(nullif(p_payload->>'icon',''),icon),
      updated_at=now()
    where id=v_role_id returning * into v_role;
    v_company_id := v_role.company_id;
  end if;

  delete from public.role_permissions where role_id=v_role_id;
  insert into public.role_permissions(role_id,permission_key,allowed)
  select v_role_id,k,true from unnest(v_permissions) k;
  get diagnostics v_count = row_count;

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_company_id,auth.uid(),case when v_is_new then 'role.created' else 'role.updated' end,'role',v_role_id,
    jsonb_build_object('permissions',v_count,'permission_keys',to_jsonb(v_permissions),'slug',v_role.slug,'source','role_studio_v2'));

  return jsonb_build_object('ok',true,'role_id',v_role_id,'permission_count',v_count,'permission_keys',to_jsonb(v_permissions));
end $$;

create or replace function public.platform_save_role_template_definition(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid := nullif(p_payload->>'template_id','')::uuid;
  v_is_new boolean := v_id is null;
  v_permissions text[] := array[]::text[];
  v_count integer := 0;
  v_code text := lower(trim(coalesce(p_payload->>'code','')));
begin
  if not app_private.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  select coalesce(array_agg(distinct value order by value),array[]::text[])
    into v_permissions
  from jsonb_array_elements_text(coalesce(p_payload->'permission_keys','[]'::jsonb));
  if exists(select 1 from unnest(v_permissions) k left join public.permissions p on p.key=k where p.key is null) then raise exception 'Unknown permission key'; end if;
  if cardinality(v_permissions)=0 and coalesce((p_payload->>'allow_empty')::boolean,false)=false then raise exception 'Select at least one permission'; end if;
  if v_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or trim(coalesce(p_payload->>'name_ar',''))='' or trim(coalesce(p_payload->>'name_en',''))='' then raise exception 'Invalid template details'; end if;

  if v_is_new then
    insert into public.role_templates(code,name_ar,name_en,description_ar,description_en,color,icon,category,is_active,is_recommended,created_by)
    values(v_code,trim(p_payload->>'name_ar'),trim(p_payload->>'name_en'),nullif(trim(coalesce(p_payload->>'description_ar','')),''),nullif(trim(coalesce(p_payload->>'description_en','')),''),coalesce(nullif(p_payload->>'color',''),'#4f46e5'),coalesce(nullif(p_payload->>'icon',''),'shield'),coalesce(nullif(p_payload->>'category',''),'general'),coalesce((p_payload->>'is_active')::boolean,true),coalesce((p_payload->>'is_recommended')::boolean,false),auth.uid())
    returning id into v_id;
  else
    update public.role_templates set code=v_code,name_ar=trim(p_payload->>'name_ar'),name_en=trim(p_payload->>'name_en'),description_ar=nullif(trim(coalesce(p_payload->>'description_ar','')),''),description_en=nullif(trim(coalesce(p_payload->>'description_en','')),''),color=coalesce(nullif(p_payload->>'color',''),'#4f46e5'),icon=coalesce(nullif(p_payload->>'icon',''),'shield'),category=coalesce(nullif(p_payload->>'category',''),'general'),is_active=coalesce((p_payload->>'is_active')::boolean,true),is_recommended=coalesce((p_payload->>'is_recommended')::boolean,false),updated_at=now() where id=v_id;
    if not found then raise exception 'Template not found'; end if;
  end if;

  delete from public.role_template_permissions where template_id=v_id;
  insert into public.role_template_permissions(template_id,permission_key,allowed)
  select v_id,k,true from unnest(v_permissions) k;
  get diagnostics v_count = row_count;
  insert into public.platform_audit_events(actor_id,action,metadata)
  values(auth.uid(),case when v_is_new then 'platform.role_template_created' else 'platform.role_template_updated' end,
    jsonb_build_object('template_id',v_id,'code',v_code,'permissions',v_count,'permission_keys',to_jsonb(v_permissions),'source','role_library_v2'));
  return jsonb_build_object('ok',true,'template_id',v_id,'permission_count',v_count,'permission_keys',to_jsonb(v_permissions));
end $$;

create or replace function public.save_company_workspace_settings(p_company_id uuid,p_company jsonb default '{}'::jsonb,p_branding jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  c public.companies%rowtype;
  b public.company_branding%rowtype;
  v_company_changed boolean := p_company <> '{}'::jsonb;
  v_branding_changed boolean := p_branding <> '{}'::jsonb;
begin
  if v_company_changed and not (app_private.has_company_permission(p_company_id,'company.manage') or app_private.is_platform_admin()) then raise exception 'Company management permission denied'; end if;
  if v_branding_changed and not (app_private.has_company_permission(p_company_id,'branding.manage') or app_private.is_platform_admin()) then raise exception 'Branding permission denied'; end if;

  if v_company_changed then
    update public.companies set
      name=case when p_company ? 'name' then trim(p_company->>'name') else name end,
      legal_name=case when p_company ? 'legal_name' then nullif(trim(coalesce(p_company->>'legal_name','')),'') else legal_name end,
      short_code=case when p_company ? 'short_code' then nullif(trim(coalesce(p_company->>'short_code','')),'') else short_code end,
      official_email=case when p_company ? 'official_email' then nullif(lower(trim(coalesce(p_company->>'official_email',''))),'') else official_email end,
      phone=case when p_company ? 'phone' then nullif(trim(coalesce(p_company->>'phone','')),'') else phone end,
      whatsapp=case when p_company ? 'whatsapp' then nullif(trim(coalesce(p_company->>'whatsapp','')),'') else whatsapp end,
      country_code=case when p_company ? 'country_code' then nullif(upper(trim(coalesce(p_company->>'country_code',''))),'') else country_code end,
      city=case when p_company ? 'city' then nullif(trim(coalesce(p_company->>'city','')),'') else city end,
      address=case when p_company ? 'address' then nullif(trim(coalesce(p_company->>'address','')),'') else address end,
      website=case when p_company ? 'website' then nullif(trim(coalesce(p_company->>'website','')),'') else website end,
      industry=case when p_company ? 'industry' then nullif(trim(coalesce(p_company->>'industry','')),'') else industry end,
      registration_number=case when p_company ? 'registration_number' then nullif(trim(coalesce(p_company->>'registration_number','')),'') else registration_number end,
      tax_number=case when p_company ? 'tax_number' then nullif(trim(coalesce(p_company->>'tax_number','')),'') else tax_number end,
      primary_contact_name=case when p_company ? 'primary_contact_name' then nullif(trim(coalesce(p_company->>'primary_contact_name','')),'') else primary_contact_name end,
      primary_contact_email=case when p_company ? 'primary_contact_email' then nullif(lower(trim(coalesce(p_company->>'primary_contact_email',''))),'') else primary_contact_email end,
      primary_contact_phone=case when p_company ? 'primary_contact_phone' then nullif(trim(coalesce(p_company->>'primary_contact_phone','')),'') else primary_contact_phone end,
      billing_contact_name=case when p_company ? 'billing_contact_name' then nullif(trim(coalesce(p_company->>'billing_contact_name','')),'') else billing_contact_name end,
      billing_contact_email=case when p_company ? 'billing_contact_email' then nullif(lower(trim(coalesce(p_company->>'billing_contact_email',''))),'') else billing_contact_email end,
      billing_contact_phone=case when p_company ? 'billing_contact_phone' then nullif(trim(coalesce(p_company->>'billing_contact_phone','')),'') else billing_contact_phone end,
      technical_contact_name=case when p_company ? 'technical_contact_name' then nullif(trim(coalesce(p_company->>'technical_contact_name','')),'') else technical_contact_name end,
      technical_contact_email=case when p_company ? 'technical_contact_email' then nullif(lower(trim(coalesce(p_company->>'technical_contact_email',''))),'') else technical_contact_email end,
      technical_contact_phone=case when p_company ? 'technical_contact_phone' then nullif(trim(coalesce(p_company->>'technical_contact_phone','')),'') else technical_contact_phone end,
      timezone=case when p_company ? 'timezone' then coalesce(nullif(trim(p_company->>'timezone'),''),timezone) else timezone end,
      default_locale=case when p_company ? 'default_locale' then case when p_company->>'default_locale'='en' then 'en' else 'ar' end else default_locale end,
      updated_at=now()
    where id=p_company_id returning * into c;
    if not found then raise exception 'Company not found'; end if;
  else select * into c from public.companies where id=p_company_id; end if;

  if v_branding_changed then
    b := public.save_company_branding(p_company_id,p_branding);
  else select * into b from public.company_branding where company_id=p_company_id; end if;

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_company_id,auth.uid(),'company.settings_updated','company',p_company_id,
    jsonb_build_object('company_fields',(select coalesce(jsonb_agg(key),'[]'::jsonb) from jsonb_object_keys(p_company) key),'branding_fields',(select coalesce(jsonb_agg(key),'[]'::jsonb) from jsonb_object_keys(p_branding) key)));

  return jsonb_build_object('company',to_jsonb(c),'branding',to_jsonb(b));
end $$;

create or replace function public.company_activity_feed(
  p_company_id uuid,
  p_search text default null,
  p_action text default null,
  p_actor_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table(
  id bigint,action text,entity_type text,entity_id uuid,metadata jsonb,created_at timestamptz,
  actor_id uuid,actor_name text,actor_avatar_path text
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select a.id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,a.actor_id,p.full_name,p.avatar_path
  from public.audit_events a
  left join public.profiles p on p.id=a.actor_id
  where a.company_id=p_company_id
    and app_private.has_company_permission(p_company_id,'audit.view')
    and (p_action is null or p_action='' or a.action=p_action)
    and (p_actor_id is null or a.actor_id=p_actor_id)
    and (p_from is null or a.created_at>=p_from)
    and (p_to is null or a.created_at<=p_to)
    and (p_search is null or p_search='' or a.action ilike '%'||p_search||'%' or a.entity_type ilike '%'||p_search||'%' or coalesce(p.full_name,'') ilike '%'||p_search||'%' or a.metadata::text ilike '%'||p_search||'%')
  order by a.created_at desc
  limit greatest(1,least(coalesce(p_limit,200),500)) offset greatest(coalesce(p_offset,0),0)
$$;

revoke all on function public.save_company_role_definition(jsonb) from public,anon;
revoke all on function public.platform_save_role_template_definition(jsonb) from public,anon;
revoke all on function public.save_company_workspace_settings(uuid,jsonb,jsonb) from public,anon;
revoke all on function public.company_activity_feed(uuid,text,text,uuid,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.save_company_role_definition(jsonb) to authenticated;
grant execute on function public.platform_save_role_template_definition(jsonb) to authenticated;
grant execute on function public.save_company_workspace_settings(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.company_activity_feed(uuid,text,text,uuid,timestamptz,timestamptz,integer,integer) to authenticated;

commit;
