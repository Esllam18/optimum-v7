begin;

-- Phase 5.4 — organization control center integrity and safe delegation.

create or replace function app_private.can_delegate_permissions(p_company_id uuid,p_permission_keys text[])
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select
    app_private.is_platform_admin()
    or app_private.is_company_owner(p_company_id,auth.uid())
    or not exists(
      select 1
      from unnest(coalesce(p_permission_keys,array[]::text[])) k
      where not app_private.has_company_permission(p_company_id,k)
    );
$$;

create or replace function app_private.can_delegate_role(p_company_id uuid,p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1
    from public.roles r
    where r.id=p_role_id
      and r.company_id=p_company_id
      and app_private.can_delegate_permissions(
        p_company_id,
        coalesce((select array_agg(rp.permission_key order by rp.permission_key)
                  from public.role_permissions rp
                  where rp.role_id=r.id and rp.allowed),array[]::text[])
      )
  );
$$;

revoke all on function app_private.can_delegate_permissions(uuid,text[]) from public,anon,authenticated;
revoke all on function app_private.can_delegate_role(uuid,uuid) from public,anon,authenticated;

create or replace function app_private.validate_company_membership_scope()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not exists(select 1 from public.roles r where r.id=new.role_id and r.company_id=new.company_id) then
    raise exception 'Membership role must belong to the same company';
  end if;
  if new.manager_user_id is not null then
    if new.manager_user_id=new.user_id then raise exception 'A member cannot manage themselves'; end if;
    if not exists(
      select 1 from public.company_memberships manager
      where manager.company_id=new.company_id
        and manager.user_id=new.manager_user_id
        and manager.status='active'
    ) then raise exception 'Manager must be an active member of the same company'; end if;
  end if;
  if new.access_starts_at is not null and new.access_ends_at is not null and new.access_ends_at<=new.access_starts_at then
    raise exception 'Access end must be after access start';
  end if;
  return new;
end $$;

drop trigger if exists validate_company_membership_scope on public.company_memberships;
create trigger validate_company_membership_scope
before insert or update of company_id,role_id,manager_user_id,user_id,access_starts_at,access_ends_at
on public.company_memberships
for each row execute function app_private.validate_company_membership_scope();
revoke all on function app_private.validate_company_membership_scope() from public,anon,authenticated;

create unique index if not exists memberships_company_employee_code_active_uidx
on public.company_memberships(company_id,lower(employee_code))
where nullif(trim(employee_code),'') is not null and status<>'left';

alter table public.company_memberships drop constraint if exists company_memberships_access_window_check;
alter table public.company_memberships add constraint company_memberships_access_window_check
check (access_starts_at is null or access_ends_at is null or access_ends_at>access_starts_at) not valid;
alter table public.company_memberships validate constraint company_memberships_access_window_check;

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
  v_color text := coalesce(nullif(p_payload->>'color',''),'#4f46e5');
  v_icon text := coalesce(nullif(trim(p_payload->>'icon'),''),'shield');
begin
  select coalesce(array_agg(distinct value order by value),array[]::text[])
    into v_permissions
  from jsonb_array_elements_text(coalesce(p_payload->'permission_keys','[]'::jsonb));

  if exists(select 1 from unnest(v_permissions) k left join public.permissions p on p.key=k where p.key is null) then
    raise exception 'Unknown permission key';
  end if;
  if cardinality(v_permissions)=0 and coalesce((p_payload->>'allow_empty')::boolean,false)=false then
    raise exception 'Select at least one permission';
  end if;
  if v_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid role color'; end if;
  if char_length(v_icon)>40 then raise exception 'Invalid role icon'; end if;

  if v_is_new then
    if v_company_id is null then raise exception 'Company is required'; end if;
    if not (app_private.has_company_permission(v_company_id,'roles.create') or app_private.has_company_permission(v_company_id,'roles.manage') or app_private.is_platform_admin()) then
      raise exception 'Role creation permission denied';
    end if;
    v_slug := lower(trim(coalesce(p_payload->>'slug','')));
    if trim(coalesce(p_payload->>'name_ar',''))='' or trim(coalesce(p_payload->>'name_en',''))='' or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      raise exception 'Invalid role details';
    end if;
  else
    select * into v_role from public.roles where id=v_role_id for update;
    if not found then raise exception 'Role not found'; end if;
    if v_role.slug='owner' then raise exception 'Owner role is protected'; end if;
    v_company_id := v_role.company_id;
    if not (app_private.has_company_permission(v_company_id,'roles.manage') or app_private.is_platform_admin()) then
      raise exception 'Role management permission denied';
    end if;
  end if;

  if not app_private.can_delegate_permissions(v_company_id,v_permissions) then
    raise exception 'You cannot grant permissions that you do not hold';
  end if;

  if v_is_new then
    insert into public.roles(company_id,name_ar,name_en,slug,description_ar,description_en,color,icon,is_default,is_protected,source_template_id,created_by)
    values(
      v_company_id,trim(p_payload->>'name_ar'),trim(p_payload->>'name_en'),v_slug,
      nullif(trim(coalesce(p_payload->>'description_ar','')),''),nullif(trim(coalesce(p_payload->>'description_en','')),''),
      v_color,v_icon,false,false,nullif(p_payload->>'template_id','')::uuid,auth.uid()
    ) returning * into v_role;
    v_role_id := v_role.id;
  else
    update public.roles set
      name_ar=trim(coalesce(p_payload->>'name_ar',name_ar)),
      name_en=trim(coalesce(p_payload->>'name_en',name_en)),
      description_ar=case when p_payload ? 'description_ar' then nullif(trim(coalesce(p_payload->>'description_ar','')),'') else description_ar end,
      description_en=case when p_payload ? 'description_en' then nullif(trim(coalesce(p_payload->>'description_en','')),'') else description_en end,
      color=v_color,icon=v_icon,updated_at=now()
    where id=v_role_id returning * into v_role;
  end if;

  delete from public.role_permissions where role_id=v_role_id;
  insert into public.role_permissions(role_id,permission_key,allowed)
  select v_role_id,k,true from unnest(v_permissions) k;
  get diagnostics v_count = row_count;

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_company_id,auth.uid(),case when v_is_new then 'role.created' else 'role.updated' end,'role',v_role_id,
    jsonb_build_object('permissions',v_count,'permission_keys',to_jsonb(v_permissions),'slug',v_role.slug,'source','organization_control_center'));

  return jsonb_build_object('ok',true,'role_id',v_role_id,'permission_count',v_count,'permission_keys',to_jsonb(v_permissions),'role',to_jsonb(v_role));
end $$;

create or replace function public.set_member_role(p_membership_id uuid,p_role_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_company_id uuid;v_target_user uuid;v_old_role uuid;v_old_owner boolean;v_new_owner boolean;v_owner_count integer;
begin
  select m.company_id,m.user_id,m.role_id,(r.slug='owner') into v_company_id,v_target_user,v_old_role,v_old_owner
  from public.company_memberships m join public.roles r on r.id=m.role_id where m.id=p_membership_id for update of m;
  if v_company_id is null then raise exception 'Member not found'; end if;
  if not app_private.has_company_permission(v_company_id,'members.manage') then raise exception 'Permission denied'; end if;
  select(slug='owner') into v_new_owner from public.roles where id=p_role_id and company_id=v_company_id;
  if v_new_owner is null then raise exception 'Invalid role'; end if;
  if v_new_owner and not (app_private.is_company_owner(v_company_id,auth.uid()) or app_private.is_platform_admin()) then raise exception 'Only an owner can assign owner role'; end if;
  if not app_private.can_delegate_role(v_company_id,p_role_id) then raise exception 'You cannot assign a role with permissions you do not hold'; end if;
  if v_old_owner and not v_new_owner then
    select count(*) into v_owner_count from public.company_memberships m join public.roles r on r.id=m.role_id where m.company_id=v_company_id and m.status='active' and r.slug='owner';
    if v_owner_count<=1 then raise exception 'Company must keep at least one owner'; end if;
  end if;
  if v_old_role is distinct from p_role_id then
    update public.company_memberships set role_id=p_role_id,updated_at=now() where id=p_membership_id;
    insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
    values(v_company_id,auth.uid(),'member.role_changed','company_membership',p_membership_id,jsonb_build_object('user_id',v_target_user,'old_role_id',v_old_role,'new_role_id',p_role_id));
  end if;
end $$;

create or replace function public.set_member_status(p_membership_id uuid,p_status public.membership_status)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_company_id uuid;v_user_id uuid;v_old_status public.membership_status;v_is_owner boolean;v_owner_count integer;
begin
  select m.company_id,m.user_id,m.status,(r.slug='owner') into v_company_id,v_user_id,v_old_status,v_is_owner
  from public.company_memberships m join public.roles r on r.id=m.role_id where m.id=p_membership_id for update of m;
  if v_company_id is null then raise exception 'Member not found'; end if;
  if not app_private.has_company_permission(v_company_id,'members.manage') then raise exception 'Permission denied'; end if;
  if v_is_owner and p_status<>'active' then
    select count(*) into v_owner_count from public.company_memberships m join public.roles r on r.id=m.role_id where m.company_id=v_company_id and m.status='active' and r.slug='owner';
    if v_owner_count<=1 then raise exception 'Company must keep at least one active owner'; end if;
  end if;
  if v_old_status is distinct from p_status then
    update public.company_memberships set status=p_status,joined_at=case when p_status='active' then coalesce(joined_at,now()) else joined_at end,updated_at=now() where id=p_membership_id;
    insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
    values(v_company_id,auth.uid(),'member.status_changed','company_membership',p_membership_id,jsonb_build_object('user_id',v_user_id,'old_status',v_old_status,'new_status',p_status));
  end if;
end $$;

create or replace function public.set_member_permission_override(p_membership_id uuid,p_permission_key text,p_allowed boolean)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.company_memberships where id=p_membership_id;
  if v_company_id is null then raise exception 'Member not found'; end if;
  if not app_private.has_company_permission(v_company_id,'members.manage') then raise exception 'Permission denied'; end if;
  if not exists(select 1 from public.permissions where key=p_permission_key) then raise exception 'Invalid permission'; end if;
  if p_allowed and not (app_private.is_platform_admin() or app_private.is_company_owner(v_company_id,auth.uid()) or app_private.has_company_permission(v_company_id,p_permission_key)) then
    raise exception 'You cannot grant a permission that you do not hold';
  end if;
  insert into public.member_permission_overrides(membership_id,permission_key,allowed) values(p_membership_id,p_permission_key,p_allowed)
  on conflict(membership_id,permission_key) do update set allowed=excluded.allowed;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_company_id,auth.uid(),'member.permission_override','company_membership',p_membership_id,jsonb_build_object('permission',p_permission_key,'allowed',p_allowed));
end $$;

create or replace function public.clear_member_permission_override(p_membership_id uuid,p_permission_key text)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_company_id uuid;v_removed integer;
begin
  select company_id into v_company_id from public.company_memberships where id=p_membership_id;
  if v_company_id is null then raise exception 'Member not found'; end if;
  if not app_private.has_company_permission(v_company_id,'members.manage') then raise exception 'Permission denied'; end if;
  delete from public.member_permission_overrides where membership_id=p_membership_id and permission_key=p_permission_key;
  get diagnostics v_removed = row_count;
  if v_removed>0 then
    insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
    values(v_company_id,auth.uid(),'member.permission_override_cleared','company_membership',p_membership_id,jsonb_build_object('permission',p_permission_key));
  end if;
end $$;

create or replace function public.save_member_hr_profile(p_membership_id uuid,p_profile jsonb,p_compensation jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  m public.company_memberships%rowtype;
  p public.profiles%rowtype;
  c public.member_compensation%rowtype;
  v_can_members boolean;v_can_comp boolean;
  v_manager uuid := nullif(p_profile->>'manager_user_id','')::uuid;
  v_start timestamptz := nullif(p_profile->>'access_starts_at','')::timestamptz;
  v_end timestamptz := nullif(p_profile->>'access_ends_at','')::timestamptz;
begin
  select * into m from public.company_memberships where id=p_membership_id for update;
  if not found then raise exception 'Membership not found'; end if;
  v_can_members := app_private.has_company_permission(m.company_id,'members.manage') or app_private.is_platform_admin();
  v_can_comp := app_private.has_company_permission(m.company_id,'compensation.manage') or app_private.is_platform_admin();
  if not v_can_members then raise exception 'Member management permission denied'; end if;
  if v_start is not null and v_end is not null and v_end<=v_start then raise exception 'Access end must be after access start'; end if;
  if v_manager is not null and (v_manager=m.user_id or not exists(select 1 from public.company_memberships mm where mm.company_id=m.company_id and mm.user_id=v_manager and mm.status='active')) then
    raise exception 'Manager must be another active member of the same company';
  end if;

  update public.profiles set
    full_name=case when p_profile ? 'full_name' then coalesce(nullif(trim(p_profile->>'full_name'),''),full_name) else full_name end,
    phone=case when p_profile ? 'phone' then nullif(trim(coalesce(p_profile->>'phone','')),'') else phone end,
    whatsapp=case when p_profile ? 'whatsapp' then nullif(trim(coalesce(p_profile->>'whatsapp','')),'') else whatsapp end,
    avatar_path=case when p_profile ? 'avatar_path' then nullif(trim(p_profile->>'avatar_path'),'') else avatar_path end,
    updated_at=now()
  where id=m.user_id returning * into p;

  update public.company_memberships set
    employee_code=case when p_profile ? 'employee_code' then nullif(trim(coalesce(p_profile->>'employee_code','')),'') else employee_code end,
    job_title=case when p_profile ? 'job_title' then nullif(trim(coalesce(p_profile->>'job_title','')),'') else job_title end,
    department=case when p_profile ? 'department' then nullif(trim(coalesce(p_profile->>'department','')),'') else department end,
    manager_user_id=case when p_profile ? 'manager_user_id' then v_manager else manager_user_id end,
    access_starts_at=case when p_profile ? 'access_starts_at' then v_start else access_starts_at end,
    access_ends_at=case when p_profile ? 'access_ends_at' then v_end else access_ends_at end,
    notes=case when p_profile ? 'notes' then nullif(trim(coalesce(p_profile->>'notes','')),'') else notes end,
    updated_at=now()
  where id=p_membership_id returning * into m;

  if p_compensation <> '{}'::jsonb then
    if not v_can_comp then raise exception 'Compensation permission denied'; end if;
    insert into public.member_compensation(membership_id,company_id,salary_amount,currency,pay_frequency,salary_effective_from,housing_allowance,transport_allowance,other_allowance,bonus_target,compensation_notes,updated_by)
    values(p_membership_id,m.company_id,nullif(p_compensation->>'salary_amount','')::numeric,upper(coalesce(nullif(p_compensation->>'currency',''),'EGP')),coalesce(nullif(p_compensation->>'pay_frequency',''),'monthly'),nullif(p_compensation->>'salary_effective_from','')::date,nullif(p_compensation->>'housing_allowance','')::numeric,nullif(p_compensation->>'transport_allowance','')::numeric,nullif(p_compensation->>'other_allowance','')::numeric,nullif(p_compensation->>'bonus_target','')::numeric,nullif(trim(coalesce(p_compensation->>'compensation_notes','')),''),auth.uid())
    on conflict(membership_id) do update set salary_amount=excluded.salary_amount,currency=excluded.currency,pay_frequency=excluded.pay_frequency,salary_effective_from=excluded.salary_effective_from,housing_allowance=excluded.housing_allowance,transport_allowance=excluded.transport_allowance,other_allowance=excluded.other_allowance,bonus_target=excluded.bonus_target,compensation_notes=excluded.compensation_notes,updated_by=auth.uid(),updated_at=now()
    returning * into c;
  else
    select * into c from public.member_compensation where membership_id=p_membership_id;
  end if;

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(m.company_id,auth.uid(),'member.profile_updated','company_membership',p_membership_id,jsonb_build_object('compensation_updated',p_compensation <> '{}'::jsonb,'manager_user_id',m.manager_user_id,'access_ends_at',m.access_ends_at));

  return jsonb_build_object('ok',true,'membership',to_jsonb(m),'profile',to_jsonb(p),'compensation',case when c.membership_id is null then null else to_jsonb(c) end);
end $$;

create or replace function public.delete_company_role(p_role_id uuid,p_replacement_role_id uuid default null)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare r public.roles%rowtype;v_count integer;
begin
  select * into r from public.roles where id=p_role_id for update;
  if not found then raise exception 'Role not found'; end if;
  if r.is_protected or r.slug='owner' then raise exception 'Protected role cannot be deleted'; end if;
  if not (app_private.has_company_permission(r.company_id,'roles.delete') or app_private.has_company_permission(r.company_id,'roles.manage') or app_private.is_platform_admin()) then raise exception 'Role deletion permission denied'; end if;
  select count(*) into v_count from public.company_memberships where role_id=p_role_id and status in ('active','invited','suspended');
  if v_count>0 then
    if p_replacement_role_id is null then raise exception 'Replacement role is required'; end if;
    if not app_private.can_delegate_role(r.company_id,p_replacement_role_id) then raise exception 'You cannot assign the selected replacement role'; end if;
    if not exists(select 1 from public.roles where id=p_replacement_role_id and company_id=r.company_id and id<>p_role_id) then raise exception 'Invalid replacement role'; end if;
    update public.company_memberships set role_id=p_replacement_role_id,updated_at=now() where role_id=p_role_id;
  end if;
  delete from public.roles where id=p_role_id;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(r.company_id,auth.uid(),'role.deleted','role',p_role_id,jsonb_build_object('reassigned_members',v_count,'replacement_role_id',p_replacement_role_id));
end $$;

-- Existing RPCs remain explicitly authenticated-only.
revoke all on function public.save_company_role_definition(jsonb) from public,anon;
revoke all on function public.set_member_role(uuid,uuid) from public,anon;
revoke all on function public.set_member_status(uuid,public.membership_status) from public,anon;
revoke all on function public.set_member_permission_override(uuid,text,boolean) from public,anon;
revoke all on function public.clear_member_permission_override(uuid,text) from public,anon;
revoke all on function public.save_member_hr_profile(uuid,jsonb,jsonb) from public,anon;
revoke all on function public.delete_company_role(uuid,uuid) from public,anon;
grant execute on function public.save_company_role_definition(jsonb) to authenticated;
grant execute on function public.set_member_role(uuid,uuid) to authenticated;
grant execute on function public.set_member_status(uuid,public.membership_status) to authenticated;
grant execute on function public.set_member_permission_override(uuid,text,boolean) to authenticated;
grant execute on function public.clear_member_permission_override(uuid,text) to authenticated;
grant execute on function public.save_member_hr_profile(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.delete_company_role(uuid,uuid) to authenticated;

commit;
