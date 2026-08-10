begin;

create or replace function app_private.protect_core_roles()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- Direct role deletes are blocked by table grants and the public API.
    -- Allow deletion so company-level foreign-key cascades remain valid.
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

revoke all on function app_private.protect_core_roles() from public, anon, authenticated;

commit;
