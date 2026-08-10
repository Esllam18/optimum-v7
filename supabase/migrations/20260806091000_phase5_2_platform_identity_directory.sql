drop function if exists public.platform_company_directory();
drop function if exists public.platform_member_directory(uuid);

create function public.platform_company_directory()
returns table(
  company_id uuid, company_name text, legal_name text, company_slug text, short_code text,
  official_email text, phone text, whatsapp text, country_code text, city text, industry text,
  primary_contact_name text, primary_contact_email text, primary_contact_phone text,
  status public.company_access_status, plan_id uuid, plan_code text, plan_name_ar text, plan_name_en text,
  member_count bigint, project_count bigint, storage_bytes bigint, max_members integer, max_projects integer,
  max_storage_bytes bigint, trial_ends_at timestamptz, current_period_ends_at timestamptz, created_at timestamptz,
  billing_cycle text, agreed_price numeric, currency text, payment_status text, last_payment_at timestamptz,
  next_payment_at timestamptz, onboarding_status text, owner_user_id uuid, owner_name text, owner_email text,
  owner_phone text, owner_must_change_password boolean, owner_password_expires_at timestamptz,
  owner_first_login_at timestamptz, branding_app_name text, branding_tagline text, branding_logo_path text,
  branding_primary_color text, branding_accent_color text, branding_default_theme text
)
language sql stable security definer set search_path=public,auth,pg_temp as $$
select c.id,c.name,c.legal_name,c.slug,c.short_code,c.official_email,c.phone,c.whatsapp,c.country_code,c.city,c.industry,
  c.primary_contact_name,c.primary_contact_email,c.primary_contact_phone,
  cs.status,sp.id,sp.code,sp.name_ar,sp.name_en,
  (select count(*) from public.company_memberships m where m.company_id=c.id and m.status='active'),
  (select count(*) from public.projects p where p.company_id=c.id and p.archived_at is null),
  coalesce((select sum(v.size_bytes) from public.document_versions v where v.company_id=c.id and v.upload_state='ready'),0),
  coalesce(cs.max_members_override,sp.max_members),coalesce(cs.max_projects_override,sp.max_projects),coalesce(cs.max_storage_bytes_override,sp.max_storage_bytes),
  cs.trial_ends_at,cs.current_period_ends_at,c.created_at,
  cs.billing_cycle,cs.agreed_price,cs.currency,cs.payment_status,cs.last_payment_at,cs.next_payment_at,c.onboarding_status,
  owner_member.user_id,owner_profile.full_name,owner_auth.email,owner_profile.phone,
  owner_security.must_change_password,owner_security.temporary_password_expires_at,owner_security.first_login_completed_at,
  brand.app_name,brand.tagline,brand.logo_path,brand.primary_color,brand.accent_color,brand.default_theme
from public.companies c
join public.company_subscriptions cs on cs.company_id=c.id
join public.service_plans sp on sp.id=cs.plan_id
left join public.company_branding brand on brand.company_id=c.id
left join lateral (
  select m.user_id from public.company_memberships m join public.roles r on r.id=m.role_id
  where m.company_id=c.id and r.slug='owner' order by m.created_at asc limit 1
) owner_member on true
left join public.profiles owner_profile on owner_profile.id=owner_member.user_id
left join auth.users owner_auth on owner_auth.id=owner_member.user_id
left join public.account_security owner_security on owner_security.user_id=owner_member.user_id
where app_private.is_platform_admin()
order by c.created_at desc;
$$;

create function public.platform_member_directory(p_company_id uuid)
returns table(
  membership_id uuid,user_id uuid,email text,full_name text,phone text,whatsapp text,avatar_path text,
  employee_code text,job_title text,department text,role_id uuid,role_name_ar text,role_name_en text,status public.membership_status,
  must_change_password boolean,password_expires_at timestamptz,first_login_completed_at timestamptz,joined_at timestamptz,
  salary_amount numeric,currency text,pay_frequency text,salary_effective_from date,housing_allowance numeric,
  transport_allowance numeric,other_allowance numeric,bonus_target numeric
)
language sql stable security definer set search_path=public,auth,pg_temp as $$
select m.id,m.user_id,coalesce(m.invited_email,u.email),p.full_name,p.phone,p.whatsapp,p.avatar_path,
  m.employee_code,m.job_title,m.department,m.role_id,r.name_ar,r.name_en,m.status,
  coalesce(sec.must_change_password,false),sec.temporary_password_expires_at,sec.first_login_completed_at,m.joined_at,
  comp.salary_amount,comp.currency,comp.pay_frequency,comp.salary_effective_from,comp.housing_allowance,
  comp.transport_allowance,comp.other_allowance,comp.bonus_target
from public.company_memberships m
join public.roles r on r.id=m.role_id
left join public.profiles p on p.id=m.user_id
left join auth.users u on u.id=m.user_id
left join public.account_security sec on sec.user_id=m.user_id
left join public.member_compensation comp on comp.membership_id=m.id
where m.company_id=p_company_id and app_private.is_platform_admin()
order by m.created_at;
$$;

revoke all on function public.platform_company_directory() from public,anon;
revoke all on function public.platform_member_directory(uuid) from public,anon;
grant execute on function public.platform_company_directory() to authenticated;
grant execute on function public.platform_member_directory(uuid) to authenticated;
