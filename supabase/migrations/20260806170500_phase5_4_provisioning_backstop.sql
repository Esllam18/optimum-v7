begin;

create or replace function app_private.validate_member_permission_override()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_actor_id uuid;
  v_provisioned_by uuid;
begin
  select m.company_id, m.provisioned_by
  into v_company_id, v_provisioned_by
  from public.company_memberships m
  where m.id = new.membership_id;

  if v_company_id is null then
    raise exception 'Member not found';
  end if;

  v_actor_id := coalesce(auth.uid(), v_provisioned_by);
  if v_actor_id is null then
    raise exception 'Permission override actor is required';
  end if;

  if not app_private.user_has_company_permission(v_actor_id, v_company_id, 'members.manage') then
    raise exception 'Member management permission required for permission overrides';
  end if;

  if new.allowed
     and not exists(
       select 1 from public.platform_admins pa
       where pa.user_id = v_actor_id and pa.is_active
     )
     and not exists(
       select 1
       from public.company_memberships m
       join public.roles r on r.id = m.role_id
       where m.company_id = v_company_id
         and m.user_id = v_actor_id
         and m.status = 'active'
         and r.slug = 'owner'
     )
     and not app_private.user_has_company_permission(v_actor_id, v_company_id, new.permission_key) then
    raise exception 'You cannot grant a permission that you do not hold';
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_member_permission_override() from public, anon, authenticated;
drop trigger if exists validate_member_permission_override on public.member_permission_overrides;
create trigger validate_member_permission_override
before insert or update of membership_id, permission_key, allowed
on public.member_permission_overrides
for each row execute function app_private.validate_member_permission_override();

create or replace function public.create_company_invitation(
  p_company_id uuid,
  p_email text,
  p_role_id uuid,
  p_expires_in_hours integer default 168
)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_token text;
  v_email text;
  v_role_slug text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_company_permission(p_company_id,'members.invite') then raise exception 'Permission denied'; end if;
  if p_expires_in_hours < 1 or p_expires_in_hours > 720 then raise exception 'Invalid expiry'; end if;

  select slug into v_role_slug
  from public.roles
  where id=p_role_id and company_id=p_company_id;
  if v_role_slug is null then raise exception 'Invalid role'; end if;
  if v_role_slug='owner' then raise exception 'Owner role cannot be assigned through member provisioning'; end if;
  if not app_private.can_delegate_role(p_company_id,p_role_id) then
    raise exception 'You cannot assign a role with permissions you do not hold';
  end if;

  v_email := lower(trim(p_email));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid email'; end if;
  if exists(
    select 1 from public.company_memberships m
    join auth.users u on u.id=m.user_id
    where m.company_id=p_company_id and lower(u.email)=v_email and m.status='active'
  ) then raise exception 'User is already a member'; end if;

  update public.company_invitations set status='revoked'
  where company_id=p_company_id and email=v_email and status='pending';

  v_token := encode(gen_random_bytes(32),'hex');
  insert into public.company_invitations(company_id,email,role_id,token_hash,status,invited_by,expires_at)
  values(p_company_id,v_email,p_role_id,encode(digest(v_token,'sha256'),'hex'),'pending',auth.uid(),now()+make_interval(hours=>p_expires_in_hours));

  insert into public.audit_events(company_id,actor_id,action,entity_type,metadata)
  values(p_company_id,auth.uid(),'invitation.created','company_invitation',jsonb_build_object('email',v_email,'role_id',p_role_id));
  return v_token;
end;
$$;

revoke all on function public.create_company_invitation(uuid,text,uuid,integer) from public,anon;
grant execute on function public.create_company_invitation(uuid,text,uuid,integer) to authenticated;

create or replace function public.service_accept_invitation_for_user(
  p_token text,
  p_user_id uuid,
  p_full_name text,
  p_phone text default null,
  p_whatsapp text default null,
  p_timezone text default 'Africa/Cairo',
  p_employee_code text default null,
  p_job_title text default null,
  p_department text default null,
  p_manager_user_id uuid default null,
  p_access_starts_at timestamptz default null,
  p_access_ends_at timestamptz default null,
  p_notes text default null,
  p_provisioned_by uuid default null,
  p_must_change_password boolean default false,
  p_password_expires_at timestamptz default null,
  p_source text default 'company'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_inv public.company_invitations%rowtype;
  v_email text;
  v_membership_id uuid;
  v_role_slug text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_inv from public.company_invitations where token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  if not found or v_inv.status<>'pending' or v_inv.expires_at<now() then raise exception 'Invitation is invalid or expired'; end if;
  select lower(email) into v_email from auth.users where id=p_user_id;
  if v_email is null or v_email<>lower(v_inv.email) then raise exception 'Invitation belongs to another email'; end if;

  select slug into v_role_slug from public.roles where id=v_inv.role_id and company_id=v_inv.company_id;
  if v_role_slug is null then raise exception 'Invalid role'; end if;
  if p_source='platform' then
    if not exists(select 1 from public.platform_admins pa where pa.user_id=p_provisioned_by and pa.is_active) then
      raise exception 'Platform administrator permission required';
    end if;
  else
    perform public.service_validate_member_provisioning(
      p_provisioned_by,
      v_inv.company_id,
      v_inv.role_id,
      p_manager_user_id,
      p_access_starts_at,
      p_access_ends_at,
      '{}'::jsonb
    );
  end if;

  update public.profiles set
    full_name=coalesce(nullif(trim(p_full_name),''),full_name),
    phone=coalesce(nullif(trim(coalesce(p_phone,'')),''),phone),
    whatsapp=coalesce(nullif(trim(coalesce(p_whatsapp,'')),''),whatsapp),
    timezone=coalesce(nullif(trim(p_timezone),''),timezone),
    updated_at=now()
  where id=p_user_id;

  insert into public.company_memberships(
    company_id,user_id,role_id,status,joined_at,employee_code,job_title,department,
    manager_user_id,access_starts_at,access_ends_at,notes,invited_email,provisioned_by
  ) values (
    v_inv.company_id,p_user_id,v_inv.role_id,'active',now(),nullif(trim(coalesce(p_employee_code,'')),''),
    nullif(trim(coalesce(p_job_title,'')),''),nullif(trim(coalesce(p_department,'')),''),p_manager_user_id,
    p_access_starts_at,p_access_ends_at,nullif(trim(coalesce(p_notes,'')),''),v_inv.email,p_provisioned_by
  )
  on conflict (company_id,user_id) do update set
    role_id=excluded.role_id,status='active',joined_at=coalesce(public.company_memberships.joined_at,now()),
    employee_code=excluded.employee_code,job_title=excluded.job_title,department=excluded.department,
    manager_user_id=excluded.manager_user_id,access_starts_at=excluded.access_starts_at,
    access_ends_at=excluded.access_ends_at,notes=excluded.notes,invited_email=excluded.invited_email,
    provisioned_by=excluded.provisioned_by,updated_at=now()
  returning id into v_membership_id;

  update public.company_invitations set status='accepted',accepted_by=p_user_id,accepted_at=now() where id=v_inv.id;
  insert into public.account_security(user_id,must_change_password,temporary_password_expires_at,provisioning_source,created_by)
  values(p_user_id,p_must_change_password,case when p_must_change_password then p_password_expires_at end,
    case when p_source in ('platform','company','recovery') then p_source else 'company' end,p_provisioned_by)
  on conflict (user_id) do update set
    must_change_password=excluded.must_change_password,
    temporary_password_expires_at=excluded.temporary_password_expires_at,
    provisioning_source=excluded.provisioning_source,
    created_by=coalesce(excluded.created_by,public.account_security.created_by),
    updated_at=now();

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_inv.company_id,p_provisioned_by,'member.provisioned','company_membership',v_membership_id,
    jsonb_build_object('email',v_inv.email,'new_account',p_must_change_password,'source',p_source,'role_id',v_inv.role_id));
  return jsonb_build_object('company_id',v_inv.company_id,'membership_id',v_membership_id,'user_id',p_user_id);
end;
$$;

revoke all on function public.service_accept_invitation_for_user(text,uuid,text,text,text,text,text,text,text,uuid,timestamptz,timestamptz,text,uuid,boolean,timestamptz,text) from public,anon,authenticated;
grant execute on function public.service_accept_invitation_for_user(text,uuid,text,text,text,text,text,text,text,uuid,timestamptz,timestamptz,text,uuid,boolean,timestamptz,text) to service_role;

commit;
