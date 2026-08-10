-- First-login completion must update the Auth password and the profile atomically from the trusted Edge Function.
create or replace function public.service_complete_first_login_for_user(
  p_user_id uuid,p_full_name text,p_phone text default null,p_whatsapp text default null,
  p_timezone text default 'Africa/Cairo',p_accept_terms boolean default false,p_source text default 'company'
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_security public.account_security%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_security from public.account_security where user_id=p_user_id for update;
  if found and v_security.must_change_password and v_security.temporary_password_expires_at is not null and v_security.temporary_password_expires_at<now() then raise exception 'Temporary password expired'; end if;
  insert into public.account_security(user_id,must_change_password,temporary_password_expires_at,first_login_completed_at,last_password_change_at,terms_accepted_at,provisioning_source)
  values(p_user_id,false,null,now(),now(),case when p_accept_terms then now() end,case when p_source in ('platform','company','recovery','legacy') then p_source else 'company' end)
  on conflict(user_id) do update set must_change_password=false,temporary_password_expires_at=null,
    first_login_completed_at=coalesce(public.account_security.first_login_completed_at,now()),last_password_change_at=now(),
    terms_accepted_at=case when p_accept_terms then coalesce(public.account_security.terms_accepted_at,now()) else public.account_security.terms_accepted_at end,
    provisioning_source=case when p_source in ('platform','company','recovery','legacy') then p_source else public.account_security.provisioning_source end,updated_at=now();
  update public.profiles set full_name=coalesce(nullif(trim(p_full_name),''),full_name),phone=coalesce(nullif(trim(coalesce(p_phone,'')),''),phone),
    whatsapp=coalesce(nullif(trim(coalesce(p_whatsapp,'')),''),whatsapp),timezone=coalesce(nullif(trim(p_timezone),''),timezone),updated_at=now() where id=p_user_id;
  return jsonb_build_object('ok',true,'user_id',p_user_id);
end;$$;
revoke all on function public.service_complete_first_login_for_user(uuid,text,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.service_complete_first_login_for_user(uuid,text,text,text,text,boolean,text) to service_role;
revoke all on function public.complete_first_login(text,text,text,text,boolean) from public,anon,authenticated;

create or replace function public.can_manage_company_member(p_membership_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select app_private.is_platform_admin() or exists(select 1 from public.company_memberships m where m.id=p_membership_id and app_private.has_company_permission(m.company_id,'members.manage'));
$$;
revoke all on function public.can_manage_company_member(uuid) from public,anon;
grant execute on function public.can_manage_company_member(uuid) to authenticated;

create or replace function public.platform_member_directory(p_company_id uuid)
returns table(membership_id uuid,user_id uuid,email text,full_name text,phone text,whatsapp text,employee_code text,job_title text,department text,role_id uuid,role_name_ar text,role_name_en text,status public.membership_status,must_change_password boolean,password_expires_at timestamptz,first_login_completed_at timestamptz,joined_at timestamptz)
language sql stable security definer set search_path=public,auth,pg_temp as $$
 select m.id,m.user_id,coalesce(m.invited_email,u.email),p.full_name,p.phone,p.whatsapp,m.employee_code,m.job_title,m.department,m.role_id,r.name_ar,r.name_en,m.status,coalesce(sec.must_change_password,false),sec.temporary_password_expires_at,sec.first_login_completed_at,m.joined_at
 from public.company_memberships m join public.roles r on r.id=m.role_id left join public.profiles p on p.id=m.user_id left join auth.users u on u.id=m.user_id left join public.account_security sec on sec.user_id=m.user_id
 where m.company_id=p_company_id and app_private.is_platform_admin() order by m.created_at;
$$;
revoke all on function public.platform_member_directory(uuid) from public,anon;
grant execute on function public.platform_member_directory(uuid) to authenticated;
