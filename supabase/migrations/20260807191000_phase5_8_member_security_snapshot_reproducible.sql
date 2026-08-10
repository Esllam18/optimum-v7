create or replace function public.member_security_snapshot(p_membership_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','auth','pg_temp' as $$
declare m public.company_memberships%rowtype; u auth.users%rowtype; s public.account_security%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into m from public.company_memberships where id=p_membership_id;
  if not found then raise exception 'Member not found'; end if;
  if not (m.user_id=auth.uid() or app_private.has_company_permission(m.company_id,'members.view') or app_private.is_platform_admin()) then raise exception 'Member view permission required'; end if;
  select * into u from auth.users where id=m.user_id;
  select * into s from public.account_security where user_id=m.user_id;
  return jsonb_build_object('last_sign_in_at',u.last_sign_in_at,'created_at',u.created_at,'email_confirmed_at',u.email_confirmed_at,'must_change_password',coalesce(s.must_change_password,false),'temporary_password_expires_at',s.temporary_password_expires_at);
end $$;
revoke all on function public.member_security_snapshot(uuid) from public,anon;
grant execute on function public.member_security_snapshot(uuid) to authenticated;
