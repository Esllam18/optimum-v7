begin;

create or replace function public.service_find_auth_user_by_email(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = auth, public, pg_temp
as $$
declare v_user auth.users%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_user
  from auth.users
  where lower(email)=lower(trim(p_email))
    and deleted_at is null
  limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'id',v_user.id,
    'email',v_user.email,
    'email_confirmed_at',v_user.email_confirmed_at,
    'created_at',v_user.created_at
  );
end;
$$;

revoke all on function public.service_find_auth_user_by_email(text) from public,anon,authenticated;
grant execute on function public.service_find_auth_user_by_email(text) to service_role;

comment on function public.service_find_auth_user_by_email(text) is
  'Service-role-only exact Auth user lookup used by identity provisioning without paginating the full Auth directory.';

commit;
