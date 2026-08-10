-- Optimum Phase 5.1 — Identity, provisioning and first-login security
-- Idempotent source-of-truth migration matching the production schema.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists timezone text not null default 'Africa/Cairo';

alter table public.companies
  add column if not exists legal_name text,
  add column if not exists short_code text,
  add column if not exists official_email text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists country_code text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists website text,
  add column if not exists industry text,
  add column if not exists registration_number text,
  add column if not exists tax_number text,
  add column if not exists primary_contact_name text,
  add column if not exists primary_contact_email text,
  add column if not exists primary_contact_phone text,
  add column if not exists billing_contact_name text,
  add column if not exists billing_contact_email text,
  add column if not exists billing_contact_phone text,
  add column if not exists technical_contact_name text,
  add column if not exists technical_contact_email text,
  add column if not exists technical_contact_phone text,
  add column if not exists internal_notes text,
  add column if not exists onboarding_status text not null default 'ready';

alter table public.company_memberships
  add column if not exists employee_code text,
  add column if not exists job_title text,
  add column if not exists department text,
  add column if not exists manager_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists access_starts_at timestamptz,
  add column if not exists access_ends_at timestamptz,
  add column if not exists notes text,
  add column if not exists invited_email text,
  add column if not exists provisioned_by uuid references public.profiles(id) on delete set null;

create table if not exists public.account_security (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  must_change_password boolean not null default false,
  temporary_password_expires_at timestamptz,
  first_login_completed_at timestamptz,
  last_password_change_at timestamptz,
  terms_accepted_at timestamptz,
  provisioning_source text not null default 'legacy' check (provisioning_source in ('legacy','platform','company','recovery')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists account_security_force_change_idx
  on public.account_security(must_change_password, temporary_password_expires_at);

alter table public.account_security enable row level security;
drop policy if exists account_security_select_visible on public.account_security;
create policy account_security_select_visible on public.account_security
for select to authenticated
using (
  user_id = (select auth.uid())
  or app_private.is_platform_admin()
  or exists (
    select 1 from public.company_memberships target
    where target.user_id=account_security.user_id
      and app_private.has_company_permission(target.company_id,'members.view')
  )
);
revoke all on public.account_security from public, anon;
grant select on public.account_security to authenticated;
grant all on public.account_security to service_role;

-- Only the service role may complete the password workflow. This avoids a client
-- clearing the first-login flag without actually changing the Auth password.
create or replace function public.service_complete_first_login_for_user(
  p_user_id uuid,
  p_full_name text,
  p_phone text default null,
  p_whatsapp text default null,
  p_timezone text default 'Africa/Cairo',
  p_accept_terms boolean default false,
  p_source text default 'company'
) returns jsonb
language plpgsql security definer
set search_path=public,auth,pg_temp
as $$
declare v_security public.account_security%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_security from public.account_security where user_id=p_user_id for update;
  if found and v_security.must_change_password and v_security.temporary_password_expires_at is not null
     and v_security.temporary_password_expires_at < now() then
    raise exception 'Temporary password expired';
  end if;

  insert into public.account_security(
    user_id,must_change_password,temporary_password_expires_at,first_login_completed_at,
    last_password_change_at,terms_accepted_at,provisioning_source
  ) values (
    p_user_id,false,null,now(),now(),case when p_accept_terms then now() end,
    case when p_source in ('platform','company','recovery','legacy') then p_source else 'company' end
  )
  on conflict(user_id) do update set
    must_change_password=false,
    temporary_password_expires_at=null,
    first_login_completed_at=coalesce(public.account_security.first_login_completed_at,now()),
    last_password_change_at=now(),
    terms_accepted_at=case when p_accept_terms then coalesce(public.account_security.terms_accepted_at,now()) else public.account_security.terms_accepted_at end,
    provisioning_source=case when p_source in ('platform','company','recovery','legacy') then p_source else public.account_security.provisioning_source end,
    updated_at=now();

  update public.profiles set
    full_name=coalesce(nullif(trim(p_full_name),''),full_name),
    phone=coalesce(nullif(trim(coalesce(p_phone,'')),''),phone),
    whatsapp=coalesce(nullif(trim(coalesce(p_whatsapp,'')),''),whatsapp),
    timezone=coalesce(nullif(trim(p_timezone),''),timezone),
    updated_at=now()
  where id=p_user_id;

  return jsonb_build_object('ok',true,'user_id',p_user_id);
end;
$$;
revoke all on function public.service_complete_first_login_for_user(uuid,text,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.service_complete_first_login_for_user(uuid,text,text,text,text,boolean,text) to service_role;

-- Legacy public function is deliberately no longer executable from the client.
revoke all on function public.complete_first_login(text,text,text,text,boolean) from public,anon,authenticated;

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
) returns jsonb
language plpgsql security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  v_inv public.company_invitations%rowtype;
  v_email text;
  v_membership_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_inv from public.company_invitations
  where token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  if not found or v_inv.status<>'pending' or v_inv.expires_at<now() then raise exception 'Invitation is invalid or expired'; end if;
  select lower(email) into v_email from auth.users where id=p_user_id;
  if v_email is null or v_email<>lower(v_inv.email) then raise exception 'Invitation belongs to another email'; end if;
  if p_access_ends_at is not null and p_access_starts_at is not null and p_access_ends_at<=p_access_starts_at then raise exception 'Invalid access period'; end if;

  update public.profiles set
    full_name=coalesce(nullif(trim(p_full_name),''),full_name),
    phone=coalesce(nullif(trim(coalesce(p_phone,'')),''),phone),
    whatsapp=coalesce(nullif(trim(coalesce(p_whatsapp,'')),''),whatsapp),
    timezone=coalesce(nullif(trim(p_timezone),''),timezone),updated_at=now()
  where id=p_user_id;

  insert into public.company_memberships(
    company_id,user_id,role_id,status,joined_at,employee_code,job_title,department,
    manager_user_id,access_starts_at,access_ends_at,notes,invited_email,provisioned_by
  ) values (
    v_inv.company_id,p_user_id,v_inv.role_id,'active',now(),nullif(trim(coalesce(p_employee_code,'')),''),
    nullif(trim(coalesce(p_job_title,'')),''),nullif(trim(coalesce(p_department,'')),''),p_manager_user_id,
    p_access_starts_at,p_access_ends_at,nullif(trim(coalesce(p_notes,'')),''),v_inv.email,p_provisioned_by
  )
  on conflict(company_id,user_id) do update set
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
  on conflict(user_id) do update set
    must_change_password=excluded.must_change_password,
    temporary_password_expires_at=excluded.temporary_password_expires_at,
    provisioning_source=excluded.provisioning_source,
    created_by=coalesce(excluded.created_by,public.account_security.created_by),updated_at=now();

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_inv.company_id,p_provisioned_by,'member.provisioned','company_membership',v_membership_id,
    jsonb_build_object('email',v_inv.email,'new_account',p_must_change_password,'source',p_source));
  return jsonb_build_object('company_id',v_inv.company_id,'membership_id',v_membership_id,'user_id',p_user_id);
end;
$$;
revoke all on function public.service_accept_invitation_for_user(text,uuid,text,text,text,text,text,text,text,uuid,timestamptz,timestamptz,text,uuid,boolean,timestamptz,text) from public,anon,authenticated;
grant execute on function public.service_accept_invitation_for_user(text,uuid,text,text,text,text,text,text,text,uuid,timestamptz,timestamptz,text,uuid,boolean,timestamptz,text) to service_role;

create or replace function public.can_manage_company_member(p_membership_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$
  select app_private.is_platform_admin() or exists(
    select 1 from public.company_memberships m
    where m.id=p_membership_id and app_private.has_company_permission(m.company_id,'members.manage')
  );
$$;
revoke all on function public.can_manage_company_member(uuid) from public,anon;
grant execute on function public.can_manage_company_member(uuid) to authenticated;
