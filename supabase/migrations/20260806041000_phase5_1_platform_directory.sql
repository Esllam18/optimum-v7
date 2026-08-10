-- Rich read models for the separate Optimum Platform Console.
drop function if exists public.platform_company_directory();
create function public.platform_company_directory()
returns table(
  company_id uuid, company_name text, legal_name text, company_slug text, short_code text,
  official_email text, phone text, whatsapp text, country_code text, city text, address text,
  website text, industry text, registration_number text, tax_number text,
  primary_contact_name text, primary_contact_email text, primary_contact_phone text,
  billing_contact_name text, billing_contact_email text, billing_contact_phone text,
  technical_contact_name text, technical_contact_email text, technical_contact_phone text,
  internal_notes text, default_locale text, timezone text, onboarding_status text,
  status public.company_access_status, plan_id uuid, plan_code text, plan_name_ar text, plan_name_en text,
  member_count bigint, pending_activation_count bigint, project_count bigint, storage_bytes bigint,
  max_members integer, max_projects integer, max_storage_bytes bigint,
  trial_ends_at timestamptz, current_period_ends_at timestamptz,
  billing_cycle text, agreed_price numeric, currency text, payment_status text,
  last_payment_at timestamptz, next_payment_at timestamptz,
  owner_user_id uuid, owner_name text, owner_email text, owner_phone text,
  owner_must_change_password boolean, owner_password_expires_at timestamptz,
  owner_first_login_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select c.id,c.name,c.legal_name,c.slug,c.short_code,c.official_email,c.phone,c.whatsapp,c.country_code,c.city,c.address,
    c.website,c.industry,c.registration_number,c.tax_number,c.primary_contact_name,c.primary_contact_email,c.primary_contact_phone,
    c.billing_contact_name,c.billing_contact_email,c.billing_contact_phone,c.technical_contact_name,c.technical_contact_email,
    c.technical_contact_phone,c.internal_notes,c.default_locale,c.timezone,c.onboarding_status,
    cs.status,sp.id,sp.code,sp.name_ar,sp.name_en,
    (select count(*) from public.company_memberships m where m.company_id=c.id and m.status='active'),
    (select count(*) from public.company_memberships m join public.account_security sec on sec.user_id=m.user_id where m.company_id=c.id and m.status='active' and sec.must_change_password),
    (select count(*) from public.projects p where p.company_id=c.id and p.archived_at is null),
    coalesce((select sum(v.size_bytes) from public.document_versions v where v.company_id=c.id and v.upload_state='ready'),0),
    coalesce(cs.max_members_override,sp.max_members),coalesce(cs.max_projects_override,sp.max_projects),coalesce(cs.max_storage_bytes_override,sp.max_storage_bytes),
    cs.trial_ends_at,cs.current_period_ends_at,cs.billing_cycle,cs.agreed_price,cs.currency,cs.payment_status,cs.last_payment_at,cs.next_payment_at,
    owner_m.user_id,owner_p.full_name,coalesce(owner_m.invited_email,owner_u.email,c.primary_contact_email),owner_p.phone,
    coalesce(owner_sec.must_change_password,false),owner_sec.temporary_password_expires_at,owner_sec.first_login_completed_at,c.created_at
  from public.companies c
  join public.company_subscriptions cs on cs.company_id=c.id
  join public.service_plans sp on sp.id=cs.plan_id
  left join lateral (
    select m.* from public.company_memberships m join public.roles r on r.id=m.role_id
    where m.company_id=c.id and r.slug='owner' order by m.created_at limit 1
  ) owner_m on true
  left join public.profiles owner_p on owner_p.id=owner_m.user_id
  left join auth.users owner_u on owner_u.id=owner_m.user_id
  left join public.account_security owner_sec on owner_sec.user_id=owner_m.user_id
  where app_private.is_platform_admin()
  order by c.created_at desc;
$$;
revoke all on function public.platform_company_directory() from public,anon;
grant execute on function public.platform_company_directory() to authenticated;
