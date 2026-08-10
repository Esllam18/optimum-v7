begin;

alter table public.company_memberships drop constraint if exists company_memberships_user_id_fkey;
alter table public.audit_events drop constraint if exists audit_events_actor_id_fkey;

create or replace function app_private.write_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_entity_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_new := null;
  elsif tg_op = 'INSERT' then
    v_old := null;
    v_new := to_jsonb(new);
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
  end if;

  v_company_id := coalesce((v_new->>'company_id')::uuid, (v_old->>'company_id')::uuid);
  v_entity_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);

  insert into public.audit_events(company_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    lower(tg_table_name || '.' || tg_op),
    tg_table_name,
    v_entity_id,
    jsonb_strip_nulls(jsonb_build_object('before', v_old, 'after', v_new))
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.protect_core_roles()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_protected then raise exception 'Protected roles cannot be deleted'; end if;
    return old;
  end if;

  if old.is_protected and (
    new.slug <> old.slug
    or new.company_id <> old.company_id
    or new.is_protected = false
  ) then
    raise exception 'Protected role identity cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.clear_member_permission_override(p_membership_id uuid, p_permission_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id
  from public.company_memberships
  where id = p_membership_id;

  if v_company_id is null then raise exception 'Member not found'; end if;
  if not app_private.has_company_permission(v_company_id,'members.manage') then
    raise exception 'Permission denied';
  end if;

  delete from public.member_permission_overrides
  where membership_id = p_membership_id
    and permission_key = p_permission_key;

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(
    v_company_id,
    auth.uid(),
    'member.permission_override_cleared',
    'company_membership',
    p_membership_id,
    jsonb_build_object('permission',p_permission_key)
  );
end;
$$;

revoke all on function app_private.write_audit_event() from public, anon, authenticated;
revoke all on function app_private.protect_core_roles() from public, anon, authenticated;
revoke all on function public.clear_member_permission_override(uuid,text) from public, anon;
grant execute on function public.clear_member_permission_override(uuid,text) to authenticated;

commit;
