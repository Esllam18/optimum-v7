-- Optimum 5.8.0 — harden View as User / member access snapshot.
-- Members may inspect their own effective access. Inspecting another member requires
-- company access management, role management, company owner authority, or Platform Admin.

create or replace function public.member_access_snapshot(p_membership_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $$
declare
  m public.company_memberships%rowtype;
  r public.roles%rowtype;
  p public.profiles%rowtype;
  effective jsonb;
  blocked jsonb;
  rules jsonb;
  addons jsonb;
  units jsonb;
  pages jsonb;
begin
  select * into m from public.company_memberships where id=p_membership_id;
  if not found then raise exception 'Member not found'; end if;

  if not (
    m.user_id=auth.uid()
    or app_private.is_platform_admin()
    or app_private.is_company_owner(m.company_id,auth.uid())
    or app_private.has_company_permission(m.company_id,'members.manage')
    or app_private.has_company_permission(m.company_id,'roles.manage')
  ) then
    raise exception 'Access inspection permission required';
  end if;

  select * into r from public.roles where id=m.role_id;
  select * into p from public.profiles where id=m.user_id;

  select coalesce(jsonb_agg(permission_key order by permission_key),'[]'::jsonb)
    into effective
  from app_private.member_effective_permission_keys(m.id);

  select coalesce(jsonb_agg(pr.key order by pr.key),'[]'::jsonb)
    into blocked
  from public.permissions pr
  where (
    r.slug='owner'
    or exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.permission_key=pr.key and rp.allowed)
    or exists(
      select 1
      from public.member_role_addons ma
      join public.role_addon_permissions ap on ap.addon_id=ma.addon_id and ap.permission_key=pr.key and ap.allowed
      where ma.membership_id=m.id
    )
  ) and not app_private.permission_entitlement_enabled(m.company_id,pr.key);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.scope_type,x.target_id),'[]'::jsonb)
    into rules
  from (
    select sr.permission_key,sr.scope_type,sr.target_id,sr.effect,sr.subject_type
    from public.access_scope_rules sr
    where sr.company_id=m.company_id
      and (
        (sr.subject_type='membership' and sr.subject_id=m.id)
        or (sr.subject_type='role' and sr.subject_id=m.role_id)
        or (sr.subject_type='addon' and sr.subject_id in(select addon_id from public.member_role_addons where membership_id=m.id))
      )
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'code',a.code,'name_ar',a.name_ar,'name_en',a.name_en,'color',a.color,'icon',a.icon
  ) order by a.name_en),'[]'::jsonb)
    into addons
  from public.member_role_addons ma
  join public.role_addons a on a.id=ma.addon_id
  where ma.membership_id=m.id and (ma.expires_at is null or ma.expires_at>now());

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'type',u.unit_type,'name_ar',u.name_ar,'name_en',u.name_en,'primary',um.is_primary
  ) order by um.is_primary desc,u.sort_order),'[]'::jsonb)
    into units
  from public.organization_unit_memberships um
  join public.organization_units u on u.id=um.unit_id
  where um.membership_id=m.id;

  pages:=jsonb_build_object(
    'dashboard',true,
    'projects',effective?'projects.view',
    'files',effective?'files.view',
    'tasks',effective?'tasks.view',
    'calendar',effective?'tasks.view',
    'engineering',effective?'drawings.view',
    'team',effective?'members.view',
    'roles',effective?'roles.view',
    'activity',effective?'audit.view',
    'settings',true
  );

  return jsonb_build_object(
    'membership',to_jsonb(m),
    'profile',to_jsonb(p),
    'role',to_jsonb(r),
    'effective_permissions',effective,
    'blocked_by_entitlement',blocked,
    'scope_rules',rules,
    'addons',addons,
    'organization_units',units,
    'pages',pages
  );
end $$;

revoke all on function public.member_access_snapshot(uuid) from public,anon;
grant execute on function public.member_access_snapshot(uuid) to authenticated;
