begin;

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

  if not exists (select 1 from public.companies where id = v_company_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

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

revoke all on function app_private.write_audit_event() from public, anon, authenticated;

commit;
