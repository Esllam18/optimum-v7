begin;

alter table public.profiles add column if not exists avatar_path text;
alter table public.roles add column if not exists description_ar text;
alter table public.roles add column if not exists description_en text;
alter table public.roles add column if not exists color text not null default '#4f46e5';
alter table public.roles add column if not exists icon text not null default 'shield';
alter table public.roles add column if not exists sort_order integer not null default 100;
alter table public.roles add column if not exists source_template_id uuid;
alter table public.roles add column if not exists created_by uuid references public.profiles(id) on delete set null;

create table if not exists public.company_branding (
  company_id uuid primary key references public.companies(id) on delete cascade,
  app_name text,
  tagline text,
  logo_path text,
  favicon_path text,
  cover_path text,
  primary_color text not null default '#4f46e5',
  accent_color text not null default '#14b8a6',
  neutral_color text not null default '#64748b',
  default_theme text not null default 'system' check (default_theme in ('system','light','dark')),
  sidebar_style text not null default 'glass' check (sidebar_style in ('solid','glass','gradient')),
  radius_style text not null default 'rounded' check (radius_style in ('sharp','soft','rounded')),
  density text not null default 'comfortable' check (density in ('compact','comfortable','spacious')),
  logo_shape text not null default 'rounded' check (logo_shape in ('square','rounded','circle')),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  check (neutral_color ~ '^#[0-9A-Fa-f]{6}$')
);

insert into public.company_branding(company_id,app_name)
select id,name from public.companies
on conflict (company_id) do nothing;

create table if not exists public.member_compensation (
  membership_id uuid primary key references public.company_memberships(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  salary_amount numeric(14,2),
  currency text not null default 'EGP',
  pay_frequency text not null default 'monthly' check (pay_frequency in ('hourly','daily','weekly','monthly','yearly','custom')),
  salary_effective_from date,
  housing_allowance numeric(14,2),
  transport_allowance numeric(14,2),
  other_allowance numeric(14,2),
  bonus_target numeric(14,2),
  compensation_notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_amount is null or salary_amount >= 0),
  check (housing_allowance is null or housing_allowance >= 0),
  check (transport_allowance is null or transport_allowance >= 0),
  check (other_allowance is null or other_allowance >= 0),
  check (bonus_target is null or bonus_target >= 0)
);

create table if not exists public.role_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  color text not null default '#4f46e5' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text not null default 'shield',
  category text not null default 'general' check (category in ('leadership','management','engineering','operations','finance','hr','viewer','general')),
  is_active boolean not null default true,
  is_recommended boolean not null default false,
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_template_permissions (
  template_id uuid not null references public.role_templates(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  allowed boolean not null default true,
  primary key(template_id,permission_key)
);

alter table public.roles drop constraint if exists roles_source_template_id_fkey;
alter table public.roles add constraint roles_source_template_id_fkey foreign key(source_template_id) references public.role_templates(id) on delete set null;

insert into public.permissions(key,module,description_ar,description_en) values
 ('branding.view','branding','عرض هوية الشركة','View company branding'),
 ('branding.manage','branding','تعديل هوية الشركة والألوان','Manage company branding and colors'),
 ('compensation.view','hr','عرض الرواتب والتعويضات','View salaries and compensation'),
 ('compensation.manage','hr','تعديل الرواتب والتعويضات','Manage salaries and compensation'),
 ('roles.create','roles','إنشاء أدوار جديدة','Create custom roles'),
 ('roles.delete','roles','حذف الأدوار المخصصة','Delete custom roles'),
 ('roles.templates.use','roles','استخدام قوالب الأدوار','Use role templates')
on conflict (key) do update set module=excluded.module,description_ar=excluded.description_ar,description_en=excluded.description_en;

-- Keep owner fully privileged and extend admin/manager with safe identity controls.
insert into public.role_permissions(role_id,permission_key,allowed)
select r.id,p.key,true from public.roles r cross join public.permissions p
where r.slug='owner'
on conflict(role_id,permission_key) do update set allowed=true;

insert into public.role_permissions(role_id,permission_key,allowed)
select r.id,p.key,true from public.roles r join public.permissions p on p.key in (
 'branding.view','branding.manage','roles.create','roles.delete','roles.templates.use','compensation.view','compensation.manage'
)
where r.slug='admin'
on conflict(role_id,permission_key) do update set allowed=true;

insert into public.role_permissions(role_id,permission_key,allowed)
select r.id,p.key,true from public.roles r join public.permissions p on p.key in ('branding.view','roles.templates.use')
where r.slug in ('manager','engineer','supervisor','viewer')
on conflict(role_id,permission_key) do update set allowed=true;

alter table public.company_branding enable row level security;
alter table public.member_compensation enable row level security;
alter table public.role_templates enable row level security;
alter table public.role_template_permissions enable row level security;

drop policy if exists company_branding_select on public.company_branding;
create policy company_branding_select on public.company_branding for select to authenticated
using (app_private.is_company_member(company_id) or app_private.is_platform_admin());
drop policy if exists company_branding_manage on public.company_branding;
create policy company_branding_manage on public.company_branding for all to authenticated
using (app_private.has_company_permission(company_id,'branding.manage') or app_private.is_platform_admin())
with check (app_private.has_company_permission(company_id,'branding.manage') or app_private.is_platform_admin());

drop policy if exists compensation_select on public.member_compensation;
create policy compensation_select on public.member_compensation for select to authenticated
using (app_private.has_company_permission(company_id,'compensation.view') or app_private.is_platform_admin());
drop policy if exists compensation_manage on public.member_compensation;
create policy compensation_manage on public.member_compensation for all to authenticated
using (app_private.has_company_permission(company_id,'compensation.manage') or app_private.is_platform_admin())
with check (app_private.has_company_permission(company_id,'compensation.manage') or app_private.is_platform_admin());

drop policy if exists role_templates_select on public.role_templates;
create policy role_templates_select on public.role_templates for select to authenticated using (is_active or app_private.is_platform_admin());
drop policy if exists role_templates_manage on public.role_templates;
create policy role_templates_manage on public.role_templates for all to authenticated
using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

drop policy if exists role_template_permissions_select on public.role_template_permissions;
create policy role_template_permissions_select on public.role_template_permissions for select to authenticated
using (exists(select 1 from public.role_templates t where t.id=template_id and (t.is_active or app_private.is_platform_admin())));
drop policy if exists role_template_permissions_manage on public.role_template_permissions;
create policy role_template_permissions_manage on public.role_template_permissions for all to authenticated
using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

create or replace function public.save_company_branding(p_company_id uuid,p_branding jsonb)
returns public.company_branding
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.company_branding;
begin
  if not (app_private.has_company_permission(p_company_id,'branding.manage') or app_private.is_platform_admin()) then raise exception 'Branding permission denied'; end if;
  insert into public.company_branding(company_id,app_name,tagline,logo_path,favicon_path,cover_path,primary_color,accent_color,neutral_color,default_theme,sidebar_style,radius_style,density,logo_shape,updated_by)
  values(p_company_id,
    nullif(trim(p_branding->>'app_name'),''),nullif(trim(p_branding->>'tagline'),''),nullif(trim(p_branding->>'logo_path'),''),nullif(trim(p_branding->>'favicon_path'),''),nullif(trim(p_branding->>'cover_path'),''),
    coalesce(nullif(p_branding->>'primary_color',''),'#4f46e5'),coalesce(nullif(p_branding->>'accent_color',''),'#14b8a6'),coalesce(nullif(p_branding->>'neutral_color',''),'#64748b'),
    coalesce(nullif(p_branding->>'default_theme',''),'system'),coalesce(nullif(p_branding->>'sidebar_style',''),'glass'),coalesce(nullif(p_branding->>'radius_style',''),'rounded'),coalesce(nullif(p_branding->>'density',''),'comfortable'),coalesce(nullif(p_branding->>'logo_shape',''),'rounded'),auth.uid())
  on conflict(company_id) do update set
    app_name=excluded.app_name,tagline=excluded.tagline,logo_path=coalesce(excluded.logo_path,public.company_branding.logo_path),favicon_path=coalesce(excluded.favicon_path,public.company_branding.favicon_path),cover_path=coalesce(excluded.cover_path,public.company_branding.cover_path),
    primary_color=excluded.primary_color,accent_color=excluded.accent_color,neutral_color=excluded.neutral_color,default_theme=excluded.default_theme,sidebar_style=excluded.sidebar_style,radius_style=excluded.radius_style,density=excluded.density,logo_shape=excluded.logo_shape,updated_by=auth.uid(),updated_at=now()
  returning * into v;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(p_company_id,auth.uid(),'company.branding_updated','company',p_company_id,jsonb_build_object('primary_color',v.primary_color,'accent_color',v.accent_color));
  return v;
end $$;

create or replace function public.save_member_hr_profile(p_membership_id uuid,p_profile jsonb,p_compensation jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.company_memberships%rowtype; v_can_members boolean; v_can_comp boolean;
begin
  select * into m from public.company_memberships where id=p_membership_id for update;
  if not found then raise exception 'Membership not found'; end if;
  v_can_members := app_private.has_company_permission(m.company_id,'members.manage') or app_private.is_platform_admin();
  v_can_comp := app_private.has_company_permission(m.company_id,'compensation.manage') or app_private.is_platform_admin();
  if not v_can_members then raise exception 'Member management permission denied'; end if;
  update public.profiles set
    full_name=coalesce(nullif(trim(p_profile->>'full_name'),''),full_name),
    phone=nullif(trim(coalesce(p_profile->>'phone','')),''),
    whatsapp=nullif(trim(coalesce(p_profile->>'whatsapp','')),''),
    avatar_path=case when p_profile ? 'avatar_path' then nullif(trim(p_profile->>'avatar_path'),'') else avatar_path end,
    updated_at=now()
  where id=m.user_id;
  update public.company_memberships set
    employee_code=nullif(trim(coalesce(p_profile->>'employee_code','')),''),
    job_title=nullif(trim(coalesce(p_profile->>'job_title','')),''),
    department=nullif(trim(coalesce(p_profile->>'department','')),''),
    manager_user_id=nullif(p_profile->>'manager_user_id','')::uuid,
    access_starts_at=nullif(p_profile->>'access_starts_at','')::timestamptz,
    access_ends_at=nullif(p_profile->>'access_ends_at','')::timestamptz,
    notes=nullif(trim(coalesce(p_profile->>'notes','')),''),updated_at=now()
  where id=p_membership_id;
  if p_compensation <> '{}'::jsonb then
    if not v_can_comp then raise exception 'Compensation permission denied'; end if;
    insert into public.member_compensation(membership_id,company_id,salary_amount,currency,pay_frequency,salary_effective_from,housing_allowance,transport_allowance,other_allowance,bonus_target,compensation_notes,updated_by)
    values(p_membership_id,m.company_id,nullif(p_compensation->>'salary_amount','')::numeric,coalesce(nullif(p_compensation->>'currency',''),'EGP'),coalesce(nullif(p_compensation->>'pay_frequency',''),'monthly'),nullif(p_compensation->>'salary_effective_from','')::date,nullif(p_compensation->>'housing_allowance','')::numeric,nullif(p_compensation->>'transport_allowance','')::numeric,nullif(p_compensation->>'other_allowance','')::numeric,nullif(p_compensation->>'bonus_target','')::numeric,nullif(trim(coalesce(p_compensation->>'compensation_notes','')),''),auth.uid())
    on conflict(membership_id) do update set salary_amount=excluded.salary_amount,currency=excluded.currency,pay_frequency=excluded.pay_frequency,salary_effective_from=excluded.salary_effective_from,housing_allowance=excluded.housing_allowance,transport_allowance=excluded.transport_allowance,other_allowance=excluded.other_allowance,bonus_target=excluded.bonus_target,compensation_notes=excluded.compensation_notes,updated_by=auth.uid(),updated_at=now();
  end if;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(m.company_id,auth.uid(),'member.profile_updated','company_membership',p_membership_id,jsonb_build_object('compensation_updated',p_compensation <> '{}'::jsonb));
  return jsonb_build_object('ok',true,'membership_id',p_membership_id,'user_id',m.user_id);
end $$;

create or replace function public.create_company_role(p_company_id uuid,p_name_ar text,p_name_en text,p_slug text,p_description_ar text default null,p_description_en text default null,p_color text default '#4f46e5',p_icon text default 'shield',p_permission_keys text[] default array[]::text[],p_template_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if not (app_private.has_company_permission(p_company_id,'roles.create') or app_private.has_company_permission(p_company_id,'roles.manage') or app_private.is_platform_admin()) then raise exception 'Role creation permission denied'; end if;
  if trim(p_name_ar)='' or trim(p_name_en)='' or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid role details'; end if;
  insert into public.roles(company_id,name_ar,name_en,slug,description_ar,description_en,color,icon,is_default,is_protected,source_template_id,created_by)
  values(p_company_id,trim(p_name_ar),trim(p_name_en),lower(trim(p_slug)),nullif(trim(p_description_ar),''),nullif(trim(p_description_en),''),p_color,p_icon,false,false,p_template_id,auth.uid()) returning id into v_id;
  insert into public.role_permissions(role_id,permission_key,allowed) select v_id,key,true from unnest(coalesce(p_permission_keys,array[]::text[])) key on conflict do nothing;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(p_company_id,auth.uid(),'role.created','role',v_id,jsonb_build_object('slug',p_slug,'template_id',p_template_id));
  return v_id;
end $$;

create or replace function public.update_company_role(p_role_id uuid,p_name_ar text,p_name_en text,p_description_ar text,p_description_en text,p_color text,p_icon text,p_permission_keys text[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.roles%rowtype;
begin
  select * into r from public.roles where id=p_role_id for update;
  if not found then raise exception 'Role not found'; end if;
  if r.slug='owner' then raise exception 'Owner role is protected'; end if;
  if not (app_private.has_company_permission(r.company_id,'roles.manage') or app_private.is_platform_admin()) then raise exception 'Role management permission denied'; end if;
  update public.roles set name_ar=trim(p_name_ar),name_en=trim(p_name_en),description_ar=nullif(trim(p_description_ar),''),description_en=nullif(trim(p_description_en),''),color=p_color,icon=p_icon,updated_at=now() where id=p_role_id;
  delete from public.role_permissions where role_id=p_role_id;
  insert into public.role_permissions(role_id,permission_key,allowed) select p_role_id,key,true from unnest(coalesce(p_permission_keys,array[]::text[])) key;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(r.company_id,auth.uid(),'role.updated','role',p_role_id,jsonb_build_object('permissions',cardinality(coalesce(p_permission_keys,array[]::text[]))));
end $$;

create or replace function public.delete_company_role(p_role_id uuid,p_replacement_role_id uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.roles%rowtype; v_count integer;
begin
  select * into r from public.roles where id=p_role_id for update;
  if not found then raise exception 'Role not found'; end if;
  if r.is_protected or r.slug='owner' then raise exception 'Protected role cannot be deleted'; end if;
  if not (app_private.has_company_permission(r.company_id,'roles.delete') or app_private.has_company_permission(r.company_id,'roles.manage') or app_private.is_platform_admin()) then raise exception 'Role deletion permission denied'; end if;
  select count(*) into v_count from public.company_memberships where role_id=p_role_id and status in ('active','invited','suspended');
  if v_count>0 then
    if p_replacement_role_id is null then raise exception 'Replacement role is required'; end if;
    if not exists(select 1 from public.roles where id=p_replacement_role_id and company_id=r.company_id and id<>p_role_id) then raise exception 'Invalid replacement role'; end if;
    update public.company_memberships set role_id=p_replacement_role_id,updated_at=now() where role_id=p_role_id;
  end if;
  delete from public.roles where id=p_role_id;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(r.company_id,auth.uid(),'role.deleted','role',p_role_id,jsonb_build_object('reassigned_members',v_count));
end $$;

create or replace function public.platform_save_role_template(p_template_id uuid,p_code text,p_name_ar text,p_name_en text,p_description_ar text,p_description_en text,p_color text,p_icon text,p_category text,p_is_active boolean,p_is_recommended boolean,p_permission_keys text[])
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if not app_private.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  if p_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid template code'; end if;
  if p_template_id is null then
    insert into public.role_templates(code,name_ar,name_en,description_ar,description_en,color,icon,category,is_active,is_recommended,created_by)
    values(lower(trim(p_code)),trim(p_name_ar),trim(p_name_en),nullif(trim(p_description_ar),''),nullif(trim(p_description_en),''),p_color,p_icon,p_category,p_is_active,p_is_recommended,auth.uid()) returning id into v_id;
  else
    update public.role_templates set code=lower(trim(p_code)),name_ar=trim(p_name_ar),name_en=trim(p_name_en),description_ar=nullif(trim(p_description_ar),''),description_en=nullif(trim(p_description_en),''),color=p_color,icon=p_icon,category=p_category,is_active=p_is_active,is_recommended=p_is_recommended,updated_at=now() where id=p_template_id returning id into v_id;
    if v_id is null then raise exception 'Template not found'; end if;
  end if;
  delete from public.role_template_permissions where template_id=v_id;
  insert into public.role_template_permissions(template_id,permission_key,allowed) select v_id,key,true from unnest(coalesce(p_permission_keys,array[]::text[])) key;
  insert into public.platform_audit_events(actor_id,action,metadata) values(auth.uid(),case when p_template_id is null then 'platform.role_template_created' else 'platform.role_template_updated' end,jsonb_build_object('template_id',v_id,'code',p_code));
  return v_id;
end $$;

create or replace function public.platform_delete_role_template(p_template_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not app_private.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  delete from public.role_templates where id=p_template_id;
  insert into public.platform_audit_events(actor_id,action,metadata) values(auth.uid(),'platform.role_template_deleted',jsonb_build_object('template_id',p_template_id));
end $$;

-- Private identity assets. Signed URLs are generated by authenticated clients.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('identity-assets','identity-assets',false,5242880,array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists identity_assets_read on storage.objects;
create policy identity_assets_read on storage.objects for select to authenticated
using (bucket_id='identity-assets' and (
  app_private.is_platform_admin() or
  exists(select 1 from public.company_memberships m where m.company_id=((storage.foldername(name))[1])::uuid and m.user_id=auth.uid() and m.status='active')
));

drop policy if exists identity_assets_insert on storage.objects;
create policy identity_assets_insert on storage.objects for insert to authenticated
with check (bucket_id='identity-assets' and (
  app_private.is_platform_admin() or
  app_private.has_company_permission(((storage.foldername(name))[1])::uuid,'branding.manage') or
  app_private.has_company_permission(((storage.foldername(name))[1])::uuid,'members.manage')
));

drop policy if exists identity_assets_update on storage.objects;
create policy identity_assets_update on storage.objects for update to authenticated
using (bucket_id='identity-assets' and (
  app_private.is_platform_admin() or app_private.has_company_permission(((storage.foldername(name))[1])::uuid,'branding.manage') or app_private.has_company_permission(((storage.foldername(name))[1])::uuid,'members.manage')
)) with check (bucket_id='identity-assets');

drop policy if exists identity_assets_delete on storage.objects;
create policy identity_assets_delete on storage.objects for delete to authenticated
using (bucket_id='identity-assets' and (
  app_private.is_platform_admin() or app_private.has_company_permission(((storage.foldername(name))[1])::uuid,'branding.manage') or app_private.has_company_permission(((storage.foldername(name))[1])::uuid,'members.manage')
));

create index if not exists company_branding_updated_by_idx on public.company_branding(updated_by);
create index if not exists member_compensation_company_idx on public.member_compensation(company_id);
create index if not exists member_compensation_updated_by_idx on public.member_compensation(updated_by);
create index if not exists role_templates_active_sort_idx on public.role_templates(is_active,sort_order);
create index if not exists role_templates_created_by_idx on public.role_templates(created_by);
create index if not exists roles_created_by_idx on public.roles(created_by);
create index if not exists roles_source_template_idx on public.roles(source_template_id);

revoke all on function public.save_company_branding(uuid,jsonb) from public,anon;
revoke all on function public.save_member_hr_profile(uuid,jsonb,jsonb) from public,anon;
revoke all on function public.create_company_role(uuid,text,text,text,text,text,text,text,text[],uuid) from public,anon;
revoke all on function public.update_company_role(uuid,text,text,text,text,text,text,text[]) from public,anon;
revoke all on function public.delete_company_role(uuid,uuid) from public,anon;
revoke all on function public.platform_save_role_template(uuid,text,text,text,text,text,text,text,text,boolean,boolean,text[]) from public,anon;
revoke all on function public.platform_delete_role_template(uuid) from public,anon;
grant execute on function public.save_company_branding(uuid,jsonb) to authenticated;
grant execute on function public.save_member_hr_profile(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.create_company_role(uuid,text,text,text,text,text,text,text,text[],uuid) to authenticated;
grant execute on function public.update_company_role(uuid,text,text,text,text,text,text,text[]) to authenticated;
grant execute on function public.delete_company_role(uuid,uuid) to authenticated;
grant execute on function public.platform_save_role_template(uuid,text,text,text,text,text,text,text,text,boolean,boolean,text[]) to authenticated;
grant execute on function public.platform_delete_role_template(uuid) to authenticated;
grant select on public.company_branding,public.member_compensation,public.role_templates,public.role_template_permissions to authenticated;

-- Starter templates for quick, understandable role creation.
insert into public.role_templates(code,name_ar,name_en,description_ar,description_en,color,icon,category,is_active,is_recommended,sort_order)
values
 ('project-manager','مدير مشروع','Project Manager','إدارة المشاريع والملفات والمهام والمراجعات','Manage projects, files, tasks, and reviews','#2563eb','briefcase','management',true,true,10),
 ('fiber-engineer','مهندس فايبر','Fiber Engineer','إنشاء وتعديل الرسومات والحصر والملفات الفنية','Create and edit drawings, BOQ, and technical files','#7c3aed','activity','engineering',true,true,20),
 ('reviewer','مراجع فني','Technical Reviewer','مراجعة الرسومات وإضافة الملاحظات والتصدير','Review drawings, add marks, and export','#0f766e','eye','engineering',true,true,30),
 ('hr-manager','مسؤول موارد بشرية','HR Manager','إدارة الأعضاء والرواتب والبيانات الوظيفية','Manage members, salaries, and employment data','#be123c','users','hr',true,false,40),
 ('read-only','مشاهدة فقط','Read Only','عرض الملفات والرسومات دون تعديل','View files and drawings without editing','#64748b','eye','viewer',true,true,90)
on conflict(code) do update set name_ar=excluded.name_ar,name_en=excluded.name_en,description_ar=excluded.description_ar,description_en=excluded.description_en,color=excluded.color,icon=excluded.icon,category=excluded.category,is_active=excluded.is_active,is_recommended=excluded.is_recommended,sort_order=excluded.sort_order,updated_at=now();

with mapping(code,permission_key) as (values
 ('project-manager','company.view'),('project-manager','members.view'),('project-manager','roles.view'),('project-manager','projects.view'),('project-manager','projects.create'),('project-manager','projects.edit'),('project-manager','files.view'),('project-manager','files.upload'),('project-manager','files.create_folder'),('project-manager','files.rename'),('project-manager','files.move'),('project-manager','files.download'),('project-manager','tasks.view'),('project-manager','tasks.create'),('project-manager','tasks.assign'),('project-manager','tasks.manage'),('project-manager','drawings.view'),('project-manager','drawings.review'),('project-manager','drawings.compare'),('project-manager','drawings.export'),('project-manager','boq.view'),('project-manager','branding.view'),
 ('fiber-engineer','company.view'),('fiber-engineer','projects.view'),('fiber-engineer','files.view'),('fiber-engineer','files.upload'),('fiber-engineer','files.download'),('fiber-engineer','tasks.view'),('fiber-engineer','tasks.create'),('fiber-engineer','tasks.comment'),('fiber-engineer','drawings.view'),('fiber-engineer','drawings.create'),('fiber-engineer','drawings.edit'),('fiber-engineer','drawings.compare'),('fiber-engineer','drawings.export'),('fiber-engineer','drawings.review'),('fiber-engineer','boq.view'),('fiber-engineer','boq.edit'),('fiber-engineer','branding.view'),
 ('reviewer','company.view'),('reviewer','projects.view'),('reviewer','files.view'),('reviewer','files.download'),('reviewer','drawings.view'),('reviewer','drawings.review'),('reviewer','drawings.compare'),('reviewer','drawings.export'),('reviewer','boq.view'),('reviewer','branding.view'),
 ('hr-manager','company.view'),('hr-manager','members.view'),('hr-manager','members.invite'),('hr-manager','members.manage'),('hr-manager','roles.view'),('hr-manager','compensation.view'),('hr-manager','compensation.manage'),('hr-manager','branding.view'),
 ('read-only','company.view'),('read-only','projects.view'),('read-only','files.view'),('read-only','files.download'),('read-only','tasks.view'),('read-only','drawings.view'),('read-only','drawings.export'),('read-only','boq.view'),('read-only','branding.view')
)
insert into public.role_template_permissions(template_id,permission_key,allowed)
select t.id,m.permission_key,true from mapping m join public.role_templates t on t.code=m.code join public.permissions p on p.key=m.permission_key
on conflict(template_id,permission_key) do update set allowed=true;

commit;
