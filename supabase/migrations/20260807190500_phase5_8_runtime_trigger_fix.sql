create or replace function app_private.bump_organization_runtime_trigger()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare cid uuid;
begin
  if tg_table_name='companies' then
    cid:=case when tg_op='DELETE' then old.id else new.id end;
  elsif tg_table_name='role_permissions' then
    select r.company_id into cid from public.roles r where r.id=case when tg_op='DELETE' then old.role_id else new.role_id end;
  elsif tg_table_name='role_addon_permissions' then
    select a.company_id into cid from public.role_addons a where a.id=case when tg_op='DELETE' then old.addon_id else new.addon_id end;
  elsif tg_table_name='organization_unit_memberships' then
    select u.company_id into cid from public.organization_units u where u.id=case when tg_op='DELETE' then old.unit_id else new.unit_id end;
  elsif tg_table_name='member_permission_overrides' then
    select m.company_id into cid from public.company_memberships m where m.id=case when tg_op='DELETE' then old.membership_id else new.membership_id end;
  elsif tg_table_name='member_role_addons' then
    select m.company_id into cid from public.company_memberships m where m.id=case when tg_op='DELETE' then old.membership_id else new.membership_id end;
  else
    cid:=case when tg_op='DELETE' then old.company_id else new.company_id end;
  end if;
  perform app_private.bump_organization_runtime(cid,tg_table_name||'.'||lower(tg_op));
  return case when tg_op='DELETE' then old else new end;
end $$;
