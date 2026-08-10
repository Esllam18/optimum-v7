-- Phase 5.5.3 — Organization Stability & UX Safety
-- Backwards-compatible hardening for the completed organization/access block.

create or replace function public.set_member_role(p_membership_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_company_id uuid; v_target_user uuid; v_old_role uuid; v_old_owner boolean;
  v_new_owner boolean; v_owner_count integer;
begin
  select m.company_id,m.user_id,m.role_id,(r.slug='owner')
  into v_company_id,v_target_user,v_old_role,v_old_owner
  from public.company_memberships m join public.roles r on r.id=m.role_id
  where m.id=p_membership_id for update of m;
  if v_company_id is null then raise exception 'Member not found'; end if;
  if not (app_private.has_company_permission(v_company_id,'members.manage') or app_private.is_platform_admin()) then raise exception 'Permission denied'; end if;
  select(slug='owner') into v_new_owner from public.roles where id=p_role_id and company_id=v_company_id;
  if v_new_owner is null then raise exception 'Invalid role'; end if;
  if v_new_owner and not (app_private.is_company_owner(v_company_id,auth.uid()) or app_private.is_platform_admin()) then raise exception 'Only an owner can assign owner role'; end if;
  if not app_private.can_delegate_role(v_company_id,p_role_id) then raise exception 'You cannot assign a role with permissions you do not hold'; end if;
  if v_old_owner and not v_new_owner then
    select count(*) into v_owner_count from public.company_memberships m join public.roles r on r.id=m.role_id
    where m.company_id=v_company_id and m.status='active' and r.slug='owner';
    if v_owner_count<=1 then raise exception 'Company must keep at least one owner'; end if;
  end if;
  if v_old_role is distinct from p_role_id then
    update public.company_memberships set role_id=p_role_id,updated_at=now() where id=p_membership_id;
    insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
    values(v_company_id,auth.uid(),'member.role_changed','company_membership',p_membership_id,jsonb_build_object('user_id',v_target_user,'old_role_id',v_old_role,'new_role_id',p_role_id));
  end if;
end $function$;

create or replace function public.set_member_status(p_membership_id uuid, p_status public.membership_status)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_company_id uuid;v_user_id uuid;v_old_status public.membership_status;v_is_owner boolean;v_owner_count integer;
begin
  select m.company_id,m.user_id,m.status,(r.slug='owner') into v_company_id,v_user_id,v_old_status,v_is_owner
  from public.company_memberships m join public.roles r on r.id=m.role_id where m.id=p_membership_id for update of m;
  if v_company_id is null then raise exception 'Member not found'; end if;
  if not (app_private.has_company_permission(v_company_id,'members.manage') or app_private.is_platform_admin()) then raise exception 'Permission denied'; end if;
  if v_is_owner and p_status<>'active' then
    select count(*) into v_owner_count from public.company_memberships m join public.roles r on r.id=m.role_id
    where m.company_id=v_company_id and m.status='active' and r.slug='owner';
    if v_owner_count<=1 then raise exception 'Company must keep at least one active owner'; end if;
  end if;
  if v_old_status is distinct from p_status then
    update public.company_memberships set status=p_status,
      joined_at=case when p_status='active' then coalesce(joined_at,now()) else joined_at end,
      left_at=case when p_status='left' then coalesce(left_at,now()) when v_old_status='left' and p_status<>'left' then null else left_at end,
      updated_at=now() where id=p_membership_id;
    insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
    values(v_company_id,auth.uid(),'member.status_changed','company_membership',p_membership_id,jsonb_build_object('user_id',v_user_id,'old_status',v_old_status,'new_status',p_status));
  end if;
end $function$;

create or replace function public.set_member_permission_override(p_membership_id uuid, p_permission_key text, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.company_memberships where id=p_membership_id;
  if v_company_id is null then raise exception 'Member not found'; end if;
  if not (app_private.has_company_permission(v_company_id,'members.manage') or app_private.is_platform_admin()) then raise exception 'Permission denied'; end if;
  if not exists(select 1 from public.permissions where key=p_permission_key) then raise exception 'Invalid permission'; end if;
  if p_allowed and not app_private.can_delegate_permissions(v_company_id,array[p_permission_key]) then raise exception 'You cannot grant a permission that you do not hold'; end if;
  insert into public.member_permission_overrides(membership_id,permission_key,allowed)
  values(p_membership_id,p_permission_key,p_allowed)
  on conflict(membership_id,permission_key) do update set allowed=excluded.allowed;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_company_id,auth.uid(),'member.permission_override','company_membership',p_membership_id,jsonb_build_object('permission',p_permission_key,'allowed',p_allowed));
end $function$;

create or replace function public.clear_member_permission_override(p_membership_id uuid, p_permission_key text)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_company_id uuid;v_removed integer;
begin
  select company_id into v_company_id from public.company_memberships where id=p_membership_id;
  if v_company_id is null then raise exception 'Member not found'; end if;
  if not (app_private.has_company_permission(v_company_id,'members.manage') or app_private.is_platform_admin()) then raise exception 'Permission denied'; end if;
  if not exists(select 1 from public.permissions where key=p_permission_key) then raise exception 'Invalid permission'; end if;
  -- Clearing a deny can increase effective access, so delegation must be checked too.
  if not app_private.can_delegate_permissions(v_company_id,array[p_permission_key]) then raise exception 'You cannot change an override for a permission that you do not hold'; end if;
  delete from public.member_permission_overrides where membership_id=p_membership_id and permission_key=p_permission_key;
  get diagnostics v_removed=row_count;
  if v_removed>0 then
    insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
    values(v_company_id,auth.uid(),'member.permission_override_cleared','company_membership',p_membership_id,jsonb_build_object('permission',p_permission_key));
  end if;
end $function$;

create or replace function public.save_organization_unit(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_id uuid:=nullif(p_payload->>'unit_id','')::uuid;
  v_company uuid:=nullif(p_payload->>'company_id','')::uuid;
  v_parent uuid:=nullif(p_payload->>'parent_id','')::uuid;
  v_manager uuid:=nullif(p_payload->>'manager_user_id','')::uuid;
  v_type text:=coalesce(nullif(p_payload->>'unit_type',''),'team');
  u public.organization_units%rowtype;
begin
  if v_company is null then raise exception 'Company required'; end if;
  if not (app_private.has_company_permission(v_company,'members.manage') or app_private.is_platform_admin()) then raise exception 'Permission denied'; end if;
  if trim(coalesce(p_payload->>'name_ar',''))='' or trim(coalesce(p_payload->>'name_en',''))='' then raise exception 'Organization unit names are required'; end if;
  if v_type not in ('division','department','team','location','cost_center') then raise exception 'Invalid organization unit type'; end if;
  if coalesce(nullif(p_payload->>'color',''),'#4f46e5') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid organization unit color'; end if;
  if v_parent is not null and not exists(select 1 from public.organization_units where id=v_parent and company_id=v_company and is_active) then raise exception 'Parent unit must belong to the same company'; end if;
  if v_manager is not null and not exists(select 1 from public.company_memberships where company_id=v_company and user_id=v_manager and status='active') then raise exception 'Manager must be an active member of the same company'; end if;
  if v_id is not null and v_parent=v_id then raise exception 'Organization unit cannot be its own parent'; end if;
  if v_id is not null and v_parent is not null and exists(
    with recursive descendants as (
      select id from public.organization_units where parent_id=v_id
      union all select c.id from public.organization_units c join descendants d on c.parent_id=d.id
    ) select 1 from descendants where id=v_parent
  ) then raise exception 'Organization hierarchy cannot contain a cycle'; end if;

  if v_id is null then
    insert into public.organization_units(company_id,parent_id,unit_type,code,name_ar,name_en,description,color,icon,manager_user_id,sort_order,created_by)
    values(v_company,v_parent,v_type,nullif(trim(p_payload->>'code'),''),trim(p_payload->>'name_ar'),trim(p_payload->>'name_en'),nullif(trim(p_payload->>'description'),''),coalesce(nullif(p_payload->>'color',''),'#4f46e5'),coalesce(nullif(p_payload->>'icon',''),'users'),v_manager,coalesce(nullif(p_payload->>'sort_order','')::int,100),auth.uid()) returning * into u;
  else
    update public.organization_units set parent_id=v_parent,unit_type=v_type,code=nullif(trim(p_payload->>'code'),''),name_ar=trim(p_payload->>'name_ar'),name_en=trim(p_payload->>'name_en'),description=nullif(trim(p_payload->>'description'),''),color=coalesce(nullif(p_payload->>'color',''),'#4f46e5'),icon=coalesce(nullif(p_payload->>'icon',''),'users'),manager_user_id=v_manager,sort_order=coalesce(nullif(p_payload->>'sort_order','')::int,100),updated_at=now()
    where id=v_id and company_id=v_company returning * into u;
    if u.id is null then raise exception 'Organization unit not found'; end if;
  end if;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_company,auth.uid(),'organization_unit.saved','organization_unit',u.id,jsonb_build_object('parent_id',u.parent_id,'manager_user_id',u.manager_user_id,'unit_type',u.unit_type));
  return jsonb_build_object('ok',true,'unit',to_jsonb(u));
end $function$;

create or replace function public.save_member_access_profile(
  p_membership_id uuid,
  p_member jsonb,
  p_addon_ids uuid[] default array[]::uuid[],
  p_unit_ids uuid[] default array[]::uuid[],
  p_scope_rules jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  m public.company_memberships%rowtype; v_addon uuid; v_unit uuid; v_rule jsonb; v_old jsonb;
  v_role uuid:=nullif(p_member->>'role_id','')::uuid;
  v_alt_manager uuid:=nullif(p_member->>'alternate_manager_user_id','')::uuid;
  v_primary_site uuid:=nullif(p_member->>'primary_site_id','')::uuid;
  v_stage text:=nullif(p_member->>'lifecycle_stage','');
  v_employment text:=nullif(p_member->>'employment_type','');
  v_work_mode text:=nullif(p_member->>'work_mode','');
  v_capacity numeric:=nullif(p_member->>'weekly_capacity_hours','')::numeric;
  v_scope_type text; v_effect text; v_permission text; v_target uuid;
begin
  select * into m from public.company_memberships where id=p_membership_id for update;
  if not found then raise exception 'Member not found'; end if;
  if not (app_private.has_company_permission(m.company_id,'members.manage') or app_private.is_platform_admin()) then raise exception 'Permission denied'; end if;
  v_old:=to_jsonb(m);

  if v_role is not null and v_role is distinct from m.role_id then
    perform public.set_member_role(p_membership_id,v_role);
    select * into m from public.company_memberships where id=p_membership_id;
  end if;
  if v_stage is not null and v_stage not in ('invited','onboarding','active','on_leave','suspended','offboarding','left') then raise exception 'Invalid lifecycle stage'; end if;
  if v_stage='left' and m.status<>'left' then raise exception 'Use the offboarding workflow before marking a member as left'; end if;
  if v_employment is not null and v_employment not in ('full_time','part_time','contractor','temporary','intern') then raise exception 'Invalid employment type'; end if;
  if v_work_mode is not null and v_work_mode not in ('onsite','hybrid','remote') then raise exception 'Invalid work mode'; end if;
  if v_capacity is not null and (v_capacity<0 or v_capacity>168) then raise exception 'Weekly capacity must be between 0 and 168 hours'; end if;
  if v_alt_manager is not null and (v_alt_manager=m.user_id or not exists(select 1 from public.company_memberships mm where mm.company_id=m.company_id and mm.user_id=v_alt_manager and mm.status='active')) then raise exception 'Alternate manager must be another active member of the same company'; end if;
  if v_primary_site is not null and not exists(select 1 from public.sites s where s.id=v_primary_site and s.company_id=m.company_id and s.archived_at is null) then raise exception 'Primary site must belong to the same company'; end if;

  update public.company_memberships set
    lifecycle_stage=coalesce(v_stage,lifecycle_stage),
    employment_type=coalesce(v_employment,employment_type),
    work_mode=coalesce(v_work_mode,work_mode),
    weekly_capacity_hours=coalesce(v_capacity,weekly_capacity_hours),
    experience_level=case when p_member?'experience_level' then nullif(trim(p_member->>'experience_level'),'') else experience_level end,
    skills=case when p_member?'skills' then coalesce(array(select jsonb_array_elements_text(p_member->'skills')),array[]::text[]) else skills end,
    alternate_manager_user_id=case when p_member?'alternate_manager_user_id' then v_alt_manager else alternate_manager_user_id end,
    primary_site_id=case when p_member?'primary_site_id' then v_primary_site else primary_site_id end,
    work_schedule=case when p_member?'work_schedule' then p_member->'work_schedule' else work_schedule end,
    lifecycle_note=case when p_member?'lifecycle_note' then nullif(trim(p_member->>'lifecycle_note'),'') else lifecycle_note end,
    onboarding_started_at=case when v_stage='onboarding' then coalesce(onboarding_started_at,now()) else onboarding_started_at end,
    offboarding_started_at=case when v_stage='offboarding' then coalesce(offboarding_started_at,now()) else offboarding_started_at end,
    updated_at=now()
  where id=p_membership_id returning * into m;

  delete from public.member_role_addons where membership_id=p_membership_id;
  foreach v_addon in array coalesce(p_addon_ids,array[]::uuid[]) loop
    if not exists(select 1 from public.role_addons a where a.id=v_addon and a.company_id=m.company_id and a.is_active) then raise exception 'Invalid role add-on'; end if;
    if not app_private.can_delegate_permissions(m.company_id,coalesce((select array_agg(permission_key) from public.role_addon_permissions where addon_id=v_addon and allowed),array[]::text[])) then raise exception 'You cannot assign this add-on'; end if;
    insert into public.member_role_addons(membership_id,addon_id,assigned_by) values(p_membership_id,v_addon,auth.uid());
  end loop;

  delete from public.organization_unit_memberships where membership_id=p_membership_id;
  foreach v_unit in array coalesce(p_unit_ids,array[]::uuid[]) loop
    if not exists(select 1 from public.organization_units u where u.id=v_unit and u.company_id=m.company_id and u.is_active) then raise exception 'Organization unit must belong to the same company'; end if;
    insert into public.organization_unit_memberships(unit_id,membership_id,is_primary) values(v_unit,p_membership_id,v_unit=p_unit_ids[1]);
  end loop;

  if jsonb_typeof(coalesce(p_scope_rules,'[]'::jsonb))<>'array' then raise exception 'Scope rules must be an array'; end if;
  delete from public.access_scope_rules where subject_type='membership' and subject_id=p_membership_id;
  for v_rule in select * from jsonb_array_elements(coalesce(p_scope_rules,'[]'::jsonb)) loop
    v_scope_type:=coalesce(nullif(v_rule->>'scope_type',''),'company');
    v_effect:=coalesce(nullif(v_rule->>'effect',''),'allow');
    v_permission:=nullif(v_rule->>'permission_key','');
    v_target:=nullif(v_rule->>'target_id','')::uuid;
    if v_scope_type not in ('company','project','site','folder','drawing') then raise exception 'Invalid scope type'; end if;
    if v_effect not in ('allow','deny') then raise exception 'Invalid scope effect'; end if;
    if v_permission is not null then
      if not exists(select 1 from public.permissions where key=v_permission) then raise exception 'Invalid scope permission'; end if;
      if not app_private.can_delegate_permissions(m.company_id,array[v_permission]) then raise exception 'You cannot delegate this scope permission'; end if;
    end if;
    if v_scope_type='company' then
      if v_target is not null then raise exception 'Company scope cannot have a target'; end if;
    else
      if v_target is null then raise exception 'Scope target is required'; end if;
      if v_scope_type='project' and not exists(select 1 from public.projects x where x.id=v_target and x.company_id=m.company_id and x.archived_at is null) then raise exception 'Project scope target must belong to the same company'; end if;
      if v_scope_type='site' and not exists(select 1 from public.sites x where x.id=v_target and x.company_id=m.company_id and x.archived_at is null) then raise exception 'Site scope target must belong to the same company'; end if;
      if v_scope_type='folder' and not exists(select 1 from public.folders x where x.id=v_target and x.company_id=m.company_id and x.trashed_at is null) then raise exception 'Folder scope target must belong to the same company'; end if;
      if v_scope_type='drawing' and not exists(select 1 from public.engineering_drawings x where x.id=v_target and x.company_id=m.company_id and x.archived_at is null) then raise exception 'Drawing scope target must belong to the same company'; end if;
    end if;
    insert into public.access_scope_rules(company_id,subject_type,subject_id,permission_key,scope_type,target_id,effect,created_by)
    values(m.company_id,'membership',p_membership_id,v_permission,v_scope_type,v_target,v_effect,auth.uid());
  end loop;

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(m.company_id,auth.uid(),'member.access_profile_updated','company_membership',m.id,
    jsonb_build_object('before',v_old,'after',to_jsonb(m),'addons',to_jsonb(p_addon_ids),'units',to_jsonb(p_unit_ids),'scope_rules',p_scope_rules));
  return jsonb_build_object('ok',true,'membership',to_jsonb(m));
end $function$;

create or replace function public.save_member_control_profile(
  p_membership_id uuid,
  p_control jsonb default '{}'::jsonb,
  p_profile jsonb default '{}'::jsonb,
  p_compensation jsonb default '{}'::jsonb,
  p_permission_overrides jsonb default '[]'::jsonb,
  p_access jsonb default '{}'::jsonb,
  p_addon_ids uuid[] default null,
  p_unit_ids uuid[] default null,
  p_scope_rules jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  m public.company_memberships%rowtype; v_item jsonb; v_state text; v_key text;
  v_role uuid:=nullif(p_control->>'role_id','')::uuid;
  v_status text:=nullif(p_control->>'status','');
  v_result jsonb;
begin
  select * into m from public.company_memberships where id=p_membership_id for update;
  if not found then raise exception 'Member not found'; end if;
  if not (app_private.has_company_permission(m.company_id,'members.manage') or app_private.is_platform_admin()) then raise exception 'Permission denied'; end if;
  if v_status='left' and m.status<>'left' then raise exception 'Use the offboarding workflow before marking a member as left'; end if;
  if v_role is not null and v_role is distinct from m.role_id then perform public.set_member_role(p_membership_id,v_role); end if;
  if v_status is not null and v_status::public.membership_status is distinct from m.status then perform public.set_member_status(p_membership_id,v_status::public.membership_status); end if;

  if coalesce(p_profile,'{}'::jsonb)<>'{}'::jsonb or coalesce(p_compensation,'{}'::jsonb)<>'{}'::jsonb then
    perform public.save_member_hr_profile(p_membership_id,coalesce(p_profile,'{}'::jsonb),coalesce(p_compensation,'{}'::jsonb));
  end if;

  if jsonb_typeof(coalesce(p_permission_overrides,'[]'::jsonb))<>'array' then raise exception 'Permission overrides must be an array'; end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_permission_overrides,'[]'::jsonb)) loop
    v_key:=nullif(v_item->>'permission_key',''); v_state:=coalesce(nullif(v_item->>'state',''),'default');
    if v_key is null then raise exception 'Permission override key is required'; end if;
    if v_state='default' then perform public.clear_member_permission_override(p_membership_id,v_key);
    elsif v_state='allow' then perform public.set_member_permission_override(p_membership_id,v_key,true);
    elsif v_state='deny' then perform public.set_member_permission_override(p_membership_id,v_key,false);
    else raise exception 'Invalid permission override state'; end if;
  end loop;

  if coalesce(p_access,'{}'::jsonb)<>'{}'::jsonb or p_addon_ids is not null or p_unit_ids is not null or p_scope_rules is not null then
    v_result:=public.save_member_access_profile(p_membership_id,coalesce(p_access,'{}'::jsonb),coalesce(p_addon_ids,array[]::uuid[]),coalesce(p_unit_ids,array[]::uuid[]),coalesce(p_scope_rules,'[]'::jsonb));
  end if;

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  select company_id,auth.uid(),'member.control_profile_saved','company_membership',id,
    jsonb_build_object('control_fields',(select coalesce(jsonb_agg(k),'[]'::jsonb) from jsonb_object_keys(coalesce(p_control,'{}'::jsonb)) k),
      'profile_fields',(select coalesce(jsonb_agg(k),'[]'::jsonb) from jsonb_object_keys(coalesce(p_profile,'{}'::jsonb)) k),
      'override_count',jsonb_array_length(coalesce(p_permission_overrides,'[]'::jsonb)),
      'access_updated',coalesce(p_access,'{}'::jsonb)<>'{}'::jsonb or p_addon_ids is not null or p_unit_ids is not null or p_scope_rules is not null)
  from public.company_memberships where id=p_membership_id;
  return public.member_access_snapshot(p_membership_id);
end $function$;

create or replace function public.save_workspace_settings_draft(
  p_company_id uuid,
  p_company jsonb default '{}'::jsonb,
  p_branding jsonb default '{}'::jsonb,
  p_change_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_company_current jsonb;v_branding_current jsonb;v_snapshot jsonb;v_draft public.workspace_setting_drafts%rowtype;v_unknown jsonb;
begin
  if jsonb_typeof(coalesce(p_company,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_branding,'{}'::jsonb))<>'object' then raise exception 'Settings payload must contain objects'; end if;
  if coalesce(p_company,'{}'::jsonb)<>'{}'::jsonb and not (app_private.has_company_permission(p_company_id,'company.manage') or app_private.is_platform_admin()) then raise exception 'Company management permission denied'; end if;
  if coalesce(p_branding,'{}'::jsonb)<>'{}'::jsonb and not (app_private.has_company_permission(p_company_id,'branding.manage') or app_private.is_platform_admin()) then raise exception 'Branding permission denied'; end if;
  if coalesce(p_company,'{}'::jsonb)='{}'::jsonb and coalesce(p_branding,'{}'::jsonb)='{}'::jsonb then raise exception 'No workspace changes supplied'; end if;
  v_company_current:=app_private.workspace_company_snapshot(p_company_id); if v_company_current is null then raise exception 'Company not found'; end if;
  v_branding_current:=coalesce(app_private.workspace_branding_snapshot(p_company_id),'{}'::jsonb);
  v_unknown:=coalesce(p_company,'{}'::jsonb)-array['name','legal_name','short_code','official_email','phone','whatsapp','country_code','city','address','website','industry','registration_number','tax_number','primary_contact_name','primary_contact_email','primary_contact_phone','billing_contact_name','billing_contact_email','billing_contact_phone','technical_contact_name','technical_contact_email','technical_contact_phone','timezone','default_locale']::text[];
  if v_unknown<>'{}'::jsonb then raise exception 'Unknown company fields in draft'; end if;
  v_unknown:=coalesce(p_branding,'{}'::jsonb)-array['app_name','tagline','logo_path','favicon_path','cover_path','primary_color','accent_color','neutral_color','default_theme','sidebar_style','radius_style','density','logo_shape']::text[];
  if v_unknown<>'{}'::jsonb then raise exception 'Unknown branding fields in draft'; end if;
  v_snapshot:=jsonb_build_object('company',v_company_current||coalesce(p_company,'{}'::jsonb),'branding',v_branding_current||coalesce(p_branding,'{}'::jsonb));
  insert into public.workspace_setting_drafts(company_id,snapshot,change_note,created_by)
  values(p_company_id,v_snapshot,nullif(trim(p_change_note),''),auth.uid())
  on conflict(company_id,created_by) where status='draft' do update set snapshot=excluded.snapshot,change_note=excluded.change_note,updated_at=now()
  returning * into v_draft;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_company_id,auth.uid(),'workspace.settings_draft_saved','workspace_setting_draft',v_draft.id,
    jsonb_build_object('changed_company_fields',coalesce((select jsonb_agg(k order by k) from jsonb_each(v_snapshot->'company') n(k,v) where (v_company_current->k) is distinct from v),'[]'::jsonb),'changed_branding_fields',coalesce((select jsonb_agg(k order by k) from jsonb_each(v_snapshot->'branding') n(k,v) where (v_branding_current->k) is distinct from v),'[]'::jsonb)));
  return jsonb_build_object('draft',to_jsonb(v_draft),'changed_company_fields',coalesce((select jsonb_agg(k order by k) from jsonb_each(v_snapshot->'company') n(k,v) where (v_company_current->k) is distinct from v),'[]'::jsonb),'changed_branding_fields',coalesce((select jsonb_agg(k order by k) from jsonb_each(v_snapshot->'branding') n(k,v) where (v_branding_current->k) is distinct from v),'[]'::jsonb));
end $function$;

-- Public RPCs remain JWT-authenticated only.
revoke all on function public.save_member_control_profile(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid[],uuid[],jsonb) from public, anon;
grant execute on function public.save_member_control_profile(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid[],uuid[],jsonb) to authenticated, service_role;
