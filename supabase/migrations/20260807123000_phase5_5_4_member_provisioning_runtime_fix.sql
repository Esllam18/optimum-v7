-- Optimum Phase 5.5.4 — member provisioning runtime reliability
create or replace function public.service_validate_member_provisioning(
  p_actor_id uuid,
  p_company_id uuid,
  p_role_id uuid,
  p_manager_user_id uuid default null,
  p_access_starts_at timestamptz default null,
  p_access_ends_at timestamptz default null,
  p_permission_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.roles%rowtype;
  v_actor_is_owner boolean;
  v_actor_is_platform boolean;
  v_override record;
  v_role_permission text;
begin
  if p_actor_id is null or p_company_id is null or p_role_id is null then
    raise exception 'Provisioning scope is incomplete';
  end if;

  select exists(
    select 1 from public.platform_admins
    where user_id = p_actor_id and is_active
  ) into v_actor_is_platform;

  select exists(
    select 1
    from public.company_memberships m
    join public.roles r on r.id = m.role_id
    where m.company_id = p_company_id
      and m.user_id = p_actor_id
      and m.status = 'active'
      and r.slug = 'owner'
      and (m.access_starts_at is null or m.access_starts_at <= now())
      and (m.access_ends_at is null or m.access_ends_at > now())
  ) into v_actor_is_owner;

  if not v_actor_is_platform
     and not app_private.user_has_company_permission(p_actor_id, p_company_id, 'members.invite') then
    raise exception 'Member invitation permission required';
  end if;

  select * into v_role
  from public.roles
  where id = p_role_id
    and company_id = p_company_id;

  if not found or v_role.slug = 'owner' then
    raise exception 'Invalid member role';
  end if;

  if not v_actor_is_platform and not v_actor_is_owner then
    for v_role_permission in
      select rp.permission_key
      from public.role_permissions rp
      where rp.role_id = p_role_id and rp.allowed
    loop
      if not app_private.user_has_company_permission(p_actor_id, p_company_id, v_role_permission) then
        raise exception 'You cannot assign a role with permissions you do not hold';
      end if;
    end loop;
  end if;

  if p_manager_user_id is not null and not exists(
    select 1
    from public.company_memberships manager
    where manager.company_id = p_company_id
      and manager.user_id = p_manager_user_id
      and manager.status = 'active'
      and (manager.access_starts_at is null or manager.access_starts_at <= now())
      and (manager.access_ends_at is null or manager.access_ends_at > now())
  ) then
    raise exception 'Manager must be an active member of the same company';
  end if;

  if p_access_starts_at is not null
     and p_access_ends_at is not null
     and p_access_ends_at <= p_access_starts_at then
    raise exception 'Access end must be after access start';
  end if;

  if jsonb_typeof(coalesce(p_permission_overrides, '{}'::jsonb)) <> 'object' then
    raise exception 'Permission overrides must be an object';
  end if;

  if p_permission_overrides <> '{}'::jsonb
     and not v_actor_is_platform
     and not app_private.user_has_company_permission(p_actor_id, p_company_id, 'members.manage') then
    raise exception 'Member management permission required for permission overrides';
  end if;

  for v_override in
    select key as permission_key, value::text::boolean as allowed
    from jsonb_each(coalesce(p_permission_overrides, '{}'::jsonb))
  loop
    if not exists(select 1 from public.permissions p where p.key = v_override.permission_key) then
      raise exception 'Unknown permission key';
    end if;
    if v_override.allowed
       and not v_actor_is_platform
       and not v_actor_is_owner
       and not app_private.user_has_company_permission(p_actor_id, p_company_id, v_override.permission_key) then
      raise exception 'You cannot grant a permission that you do not hold';
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'role_id', v_role.id,
    'role_slug', v_role.slug,
    'override_count', (select count(*)::integer from jsonb_each(coalesce(p_permission_overrides, '{}'::jsonb)))
  );
end;
$$;

revoke all on function public.service_validate_member_provisioning(uuid, uuid, uuid, uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.service_validate_member_provisioning(uuid, uuid, uuid, uuid, timestamptz, timestamptz, jsonb) to service_role;
