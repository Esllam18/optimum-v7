begin;

alter table public.companies drop constraint if exists companies_official_email_format_check;
alter table public.companies add constraint companies_official_email_format_check
  check (official_email is null or official_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;
alter table public.companies validate constraint companies_official_email_format_check;

alter table public.companies drop constraint if exists companies_primary_contact_email_format_check;
alter table public.companies add constraint companies_primary_contact_email_format_check
  check (primary_contact_email is null or primary_contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;
alter table public.companies validate constraint companies_primary_contact_email_format_check;

alter table public.companies drop constraint if exists companies_billing_contact_email_format_check;
alter table public.companies add constraint companies_billing_contact_email_format_check
  check (billing_contact_email is null or billing_contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;
alter table public.companies validate constraint companies_billing_contact_email_format_check;

alter table public.companies drop constraint if exists companies_technical_contact_email_format_check;
alter table public.companies add constraint companies_technical_contact_email_format_check
  check (technical_contact_email is null or technical_contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;
alter table public.companies validate constraint companies_technical_contact_email_format_check;

alter table public.companies drop constraint if exists companies_country_code_format_check;
alter table public.companies add constraint companies_country_code_format_check
  check (country_code is null or country_code ~ '^[A-Z]{2,3}$') not valid;
alter table public.companies validate constraint companies_country_code_format_check;

alter table public.companies drop constraint if exists companies_website_format_check;
alter table public.companies add constraint companies_website_format_check
  check (website is null or website ~* '^https?://[^[:space:]]+$') not valid;
alter table public.companies validate constraint companies_website_format_check;

alter table public.companies drop constraint if exists companies_timezone_nonempty_check;
alter table public.companies add constraint companies_timezone_nonempty_check
  check (char_length(trim(timezone)) between 1 and 80) not valid;
alter table public.companies validate constraint companies_timezone_nonempty_check;

alter table public.company_branding drop constraint if exists company_branding_app_name_check;
alter table public.company_branding add constraint company_branding_app_name_check
  check (app_name is null or char_length(trim(app_name)) between 2 and 120) not valid;
alter table public.company_branding validate constraint company_branding_app_name_check;

alter table public.company_branding drop constraint if exists company_branding_tagline_check;
alter table public.company_branding add constraint company_branding_tagline_check
  check (tagline is null or char_length(tagline) <= 240) not valid;
alter table public.company_branding validate constraint company_branding_tagline_check;

alter table public.company_branding drop constraint if exists company_branding_asset_path_length_check;
alter table public.company_branding add constraint company_branding_asset_path_length_check
  check (
    (logo_path is null or char_length(logo_path) <= 1024)
    and (favicon_path is null or char_length(favicon_path) <= 1024)
    and (cover_path is null or char_length(cover_path) <= 1024)
  ) not valid;
alter table public.company_branding validate constraint company_branding_asset_path_length_check;

create or replace function public.save_company_branding(p_company_id uuid,p_branding jsonb)
returns public.company_branding
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.company_branding%rowtype;
  v_existing public.company_branding%rowtype;
  v_app_name text;
  v_tagline text;
  v_logo_path text;
  v_favicon_path text;
  v_cover_path text;
  v_primary text;
  v_accent text;
  v_neutral text;
  v_theme text;
  v_sidebar text;
  v_radius text;
  v_density text;
  v_logo_shape text;
  v_unknown jsonb;
begin
  if not (app_private.has_company_permission(p_company_id,'branding.manage') or app_private.is_platform_admin()) then
    raise exception 'Branding permission denied';
  end if;
  if jsonb_typeof(coalesce(p_branding,'{}'::jsonb)) <> 'object' then
    raise exception 'Branding payload must be an object';
  end if;

  v_unknown := coalesce(p_branding,'{}'::jsonb) - array[
    'app_name','tagline','logo_path','favicon_path','cover_path',
    'primary_color','accent_color','neutral_color','default_theme',
    'sidebar_style','radius_style','density','logo_shape'
  ]::text[];
  if v_unknown <> '{}'::jsonb then
    raise exception 'Unknown branding fields: %', array_to_string(array(select jsonb_object_keys(v_unknown)),', ');
  end if;

  select * into v_existing from public.company_branding where company_id=p_company_id;
  if not found then
    select p_company_id,c.name,null,null,null,null,'#4f46e5','#14b8a6','#64748b','system','glass','rounded','comfortable','rounded',null,now(),now()
    into v_existing
    from public.companies c where c.id=p_company_id;
    if not found then raise exception 'Company not found'; end if;
  end if;

  v_app_name := case when p_branding ? 'app_name' then nullif(trim(coalesce(p_branding->>'app_name','')),'') else v_existing.app_name end;
  v_tagline := case when p_branding ? 'tagline' then nullif(trim(coalesce(p_branding->>'tagline','')),'') else v_existing.tagline end;
  v_logo_path := case when p_branding ? 'logo_path' then nullif(trim(coalesce(p_branding->>'logo_path','')),'') else v_existing.logo_path end;
  v_favicon_path := case when p_branding ? 'favicon_path' then nullif(trim(coalesce(p_branding->>'favicon_path','')),'') else v_existing.favicon_path end;
  v_cover_path := case when p_branding ? 'cover_path' then nullif(trim(coalesce(p_branding->>'cover_path','')),'') else v_existing.cover_path end;
  v_primary := case when p_branding ? 'primary_color' then trim(coalesce(p_branding->>'primary_color','')) else v_existing.primary_color end;
  v_accent := case when p_branding ? 'accent_color' then trim(coalesce(p_branding->>'accent_color','')) else v_existing.accent_color end;
  v_neutral := case when p_branding ? 'neutral_color' then trim(coalesce(p_branding->>'neutral_color','')) else v_existing.neutral_color end;
  v_theme := case when p_branding ? 'default_theme' then trim(coalesce(p_branding->>'default_theme','')) else v_existing.default_theme end;
  v_sidebar := case when p_branding ? 'sidebar_style' then trim(coalesce(p_branding->>'sidebar_style','')) else v_existing.sidebar_style end;
  v_radius := case when p_branding ? 'radius_style' then trim(coalesce(p_branding->>'radius_style','')) else v_existing.radius_style end;
  v_density := case when p_branding ? 'density' then trim(coalesce(p_branding->>'density','')) else v_existing.density end;
  v_logo_shape := case when p_branding ? 'logo_shape' then trim(coalesce(p_branding->>'logo_shape','')) else v_existing.logo_shape end;

  if v_app_name is null or char_length(v_app_name) not between 2 and 120 then raise exception 'Workspace name must be between 2 and 120 characters'; end if;
  if v_tagline is not null and char_length(v_tagline)>240 then raise exception 'Tagline is too long'; end if;
  if v_primary !~ '^#[0-9A-Fa-f]{6}$' or v_accent !~ '^#[0-9A-Fa-f]{6}$' or v_neutral !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Brand colors must use #RRGGBB format'; end if;
  if v_theme not in ('system','light','dark') then raise exception 'Invalid default theme'; end if;
  if v_sidebar not in ('solid','glass','gradient') then raise exception 'Invalid sidebar style'; end if;
  if v_radius not in ('sharp','soft','rounded') then raise exception 'Invalid radius style'; end if;
  if v_density not in ('compact','comfortable','spacious') then raise exception 'Invalid interface density'; end if;
  if v_logo_shape not in ('square','rounded','circle') then raise exception 'Invalid logo shape'; end if;
  if coalesce(char_length(v_logo_path),0)>1024 or coalesce(char_length(v_favicon_path),0)>1024 or coalesce(char_length(v_cover_path),0)>1024 then raise exception 'Brand asset path is too long'; end if;

  insert into public.company_branding(
    company_id,app_name,tagline,logo_path,favicon_path,cover_path,
    primary_color,accent_color,neutral_color,default_theme,sidebar_style,
    radius_style,density,logo_shape,updated_by
  ) values (
    p_company_id,v_app_name,v_tagline,v_logo_path,v_favicon_path,v_cover_path,
    lower(v_primary),lower(v_accent),lower(v_neutral),v_theme,v_sidebar,
    v_radius,v_density,v_logo_shape,auth.uid()
  ) on conflict(company_id) do update set
    app_name=excluded.app_name,
    tagline=excluded.tagline,
    logo_path=excluded.logo_path,
    favicon_path=excluded.favicon_path,
    cover_path=excluded.cover_path,
    primary_color=excluded.primary_color,
    accent_color=excluded.accent_color,
    neutral_color=excluded.neutral_color,
    default_theme=excluded.default_theme,
    sidebar_style=excluded.sidebar_style,
    radius_style=excluded.radius_style,
    density=excluded.density,
    logo_shape=excluded.logo_shape,
    updated_by=auth.uid(),
    updated_at=now()
  returning * into v;

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_company_id,auth.uid(),'company.branding_updated','company',p_company_id,
    jsonb_build_object(
      'fields',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(p_branding) key),
      'primary_color',v.primary_color,'accent_color',v.accent_color,
      'theme',v.default_theme,'density',v.density
    ));
  return v;
end;
$$;

create or replace function public.save_company_workspace_settings(
  p_company_id uuid,
  p_company jsonb default '{}'::jsonb,
  p_branding jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  c public.companies%rowtype;
  b public.company_branding%rowtype;
  v_company_changed boolean := coalesce(p_company,'{}'::jsonb) <> '{}'::jsonb;
  v_branding_changed boolean := coalesce(p_branding,'{}'::jsonb) <> '{}'::jsonb;
  v_unknown jsonb;
  v_email text;
  v_website text;
  v_country text;
  v_timezone text;
begin
  if jsonb_typeof(coalesce(p_company,'{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_branding,'{}'::jsonb)) <> 'object' then
    raise exception 'Settings payload must contain objects';
  end if;
  if v_company_changed and not (app_private.has_company_permission(p_company_id,'company.manage') or app_private.is_platform_admin()) then raise exception 'Company management permission denied'; end if;
  if v_branding_changed and not (app_private.has_company_permission(p_company_id,'branding.manage') or app_private.is_platform_admin()) then raise exception 'Branding permission denied'; end if;

  v_unknown := coalesce(p_company,'{}'::jsonb) - array[
    'name','legal_name','short_code','official_email','phone','whatsapp',
    'country_code','city','address','website','industry','registration_number',
    'tax_number','primary_contact_name','primary_contact_email','primary_contact_phone',
    'billing_contact_name','billing_contact_email','billing_contact_phone',
    'technical_contact_name','technical_contact_email','technical_contact_phone',
    'timezone','default_locale'
  ]::text[];
  if v_unknown <> '{}'::jsonb then
    raise exception 'Unknown company fields: %', array_to_string(array(select jsonb_object_keys(v_unknown)),', ');
  end if;

  if v_company_changed then
    if p_company ? 'name' and char_length(trim(coalesce(p_company->>'name',''))) not between 2 and 120 then raise exception 'Company name must be between 2 and 120 characters'; end if;
    foreach v_email in array array[
      nullif(lower(trim(coalesce(p_company->>'official_email',''))),''),
      nullif(lower(trim(coalesce(p_company->>'primary_contact_email',''))),''),
      nullif(lower(trim(coalesce(p_company->>'billing_contact_email',''))),''),
      nullif(lower(trim(coalesce(p_company->>'technical_contact_email',''))),'')
    ] loop
      if v_email is not null and v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid company email address'; end if;
    end loop;
    v_country := nullif(upper(trim(coalesce(p_company->>'country_code',''))),'');
    if p_company ? 'country_code' and v_country is not null and v_country !~ '^[A-Z]{2,3}$' then raise exception 'Country code must contain 2 or 3 letters'; end if;
    v_website := nullif(trim(coalesce(p_company->>'website','')),'');
    if p_company ? 'website' and v_website is not null and v_website !~* '^https?://[^[:space:]]+$' then raise exception 'Website must start with http:// or https://'; end if;
    v_timezone := case when p_company ? 'timezone' then trim(coalesce(p_company->>'timezone','')) else null end;
    if p_company ? 'timezone' and char_length(v_timezone) not between 1 and 80 then raise exception 'Timezone is required'; end if;
    if p_company ? 'default_locale' and coalesce(p_company->>'default_locale','') not in ('ar','en') then raise exception 'Invalid default locale'; end if;

    update public.companies set
      name=case when p_company ? 'name' then trim(p_company->>'name') else name end,
      legal_name=case when p_company ? 'legal_name' then nullif(trim(coalesce(p_company->>'legal_name','')),'') else legal_name end,
      short_code=case when p_company ? 'short_code' then nullif(upper(trim(coalesce(p_company->>'short_code',''))),'') else short_code end,
      official_email=case when p_company ? 'official_email' then nullif(lower(trim(coalesce(p_company->>'official_email',''))),'') else official_email end,
      phone=case when p_company ? 'phone' then nullif(trim(coalesce(p_company->>'phone','')),'') else phone end,
      whatsapp=case when p_company ? 'whatsapp' then nullif(trim(coalesce(p_company->>'whatsapp','')),'') else whatsapp end,
      country_code=case when p_company ? 'country_code' then v_country else country_code end,
      city=case when p_company ? 'city' then nullif(trim(coalesce(p_company->>'city','')),'') else city end,
      address=case when p_company ? 'address' then nullif(trim(coalesce(p_company->>'address','')),'') else address end,
      website=case when p_company ? 'website' then v_website else website end,
      industry=case when p_company ? 'industry' then nullif(trim(coalesce(p_company->>'industry','')),'') else industry end,
      registration_number=case when p_company ? 'registration_number' then nullif(trim(coalesce(p_company->>'registration_number','')),'') else registration_number end,
      tax_number=case when p_company ? 'tax_number' then nullif(trim(coalesce(p_company->>'tax_number','')),'') else tax_number end,
      primary_contact_name=case when p_company ? 'primary_contact_name' then nullif(trim(coalesce(p_company->>'primary_contact_name','')),'') else primary_contact_name end,
      primary_contact_email=case when p_company ? 'primary_contact_email' then nullif(lower(trim(coalesce(p_company->>'primary_contact_email',''))),'') else primary_contact_email end,
      primary_contact_phone=case when p_company ? 'primary_contact_phone' then nullif(trim(coalesce(p_company->>'primary_contact_phone','')),'') else primary_contact_phone end,
      billing_contact_name=case when p_company ? 'billing_contact_name' then nullif(trim(coalesce(p_company->>'billing_contact_name','')),'') else billing_contact_name end,
      billing_contact_email=case when p_company ? 'billing_contact_email' then nullif(lower(trim(coalesce(p_company->>'billing_contact_email',''))),'') else billing_contact_email end,
      billing_contact_phone=case when p_company ? 'billing_contact_phone' then nullif(trim(coalesce(p_company->>'billing_contact_phone','')),'') else billing_contact_phone end,
      technical_contact_name=case when p_company ? 'technical_contact_name' then nullif(trim(coalesce(p_company->>'technical_contact_name','')),'') else technical_contact_name end,
      technical_contact_email=case when p_company ? 'technical_contact_email' then nullif(lower(trim(coalesce(p_company->>'technical_contact_email',''))),'') else technical_contact_email end,
      technical_contact_phone=case when p_company ? 'technical_contact_phone' then nullif(trim(coalesce(p_company->>'technical_contact_phone','')),'') else technical_contact_phone end,
      timezone=case when p_company ? 'timezone' then v_timezone else timezone end,
      default_locale=case when p_company ? 'default_locale' then p_company->>'default_locale' else default_locale end,
      updated_at=now()
    where id=p_company_id returning * into c;
    if not found then raise exception 'Company not found'; end if;
  else
    select * into c from public.companies where id=p_company_id;
    if not found then raise exception 'Company not found'; end if;
  end if;

  if v_branding_changed then
    b := public.save_company_branding(p_company_id,p_branding);
  else
    select * into b from public.company_branding where company_id=p_company_id;
  end if;

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_company_id,auth.uid(),'company.settings_updated','company',p_company_id,
    jsonb_build_object(
      'company_fields',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(p_company) key),
      'branding_fields',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(p_branding) key),
      'source','organization_control_center'
    ));

  return jsonb_build_object('company',to_jsonb(c),'branding',to_jsonb(b));
end;
$$;

revoke all on function public.save_company_branding(uuid,jsonb) from public,anon;
revoke all on function public.save_company_workspace_settings(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_company_branding(uuid,jsonb) to authenticated;
grant execute on function public.save_company_workspace_settings(uuid,jsonb,jsonb) to authenticated;

commit;
